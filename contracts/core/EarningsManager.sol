// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/OZ_IERC20.sol";
import "../DeFi/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../DeFi/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "../DeFi/uniswapv2/interfaces/IUniswapV2Router02.sol";
import "../interfaces/IPathOracle.sol";
import "../interfaces/IPriceOracle.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EarningsManager is Ownable {
    address public factory;
    IUniswapV2Factory Factory;
    address[] public swapPairs;
    mapping(address => uint256) public swapIndex;
    mapping(address => bool) public whitelist;

    modifier onlyFactory() {
        require(msg.sender == factory, "Gravity Finance: FORBIDDEN");
        _;
    }

    modifier onlyWhitelist() {
        require(whitelist[msg.sender], "Caller is not in whitelist!");
        _;
    }

    /**
    * @dev emitted when a new pair is added to the earnings manager
    * @param pairAddress the address of the newly added pair
    **/
    event pairAdded(address pairAddress);

    /**
    * @dev emitted when owner changes the whitelist
    * @param _address the address that had its whitelist status changed
    * @param newBool the new state of the address
    **/
    event whiteListChanged(address _address, bool newBool);

    /** 
    * @dev emitted when owner calls adminWithdraw
    * @param asset the address of the asset that was moved out of the fee manager
    **/
    event AdminWithdrawCalled(address asset);

    constructor(address _factory) {
        swapPairs.push(address(0));
        factory = _factory;
        Factory = IUniswapV2Factory(factory);
    }

    function addSwapPair(address pairAddress) external onlyFactory {
        require(swapIndex[pairAddress] == 0, "Already have pair catalouged");
        swapPairs.push(pairAddress);
        swapIndex[pairAddress] = swapPairs.length;

    }

    function adjustWhitelist(address _address, bool _bool) external onlyOwner {
        whitelist[_address] = _bool;
        emit whiteListChanged(_address, _bool);
    }

    function validTimeWindow(address pairAddress) public returns (uint valid, uint expires){
        IPriceOracle PriceOracle = IPriceOracle(Factory.priceOracle());
        //Assume there are only two swaps to get to the pool assets
        // swap wETH to GFI, and swap 1/2 GFI to Other

        //Two pair addresses to worry about is this one pairAddress, and the weth/gfi pair
        
        //Call get price to update prices on both pairs
        PriceOracle.getPrice(pairAddress);
        address firstAddress = Factory.getPair(Factory.weth(), Factory.gfi());
        PriceOracle.getPrice(firstAddress);

        //*****CHECK IF WE NEED TO LOOK AT ALTs
        (uint pairACurrentTime, uint pairAOtherTime) = PriceOracle.getOracleTime(firstAddress);
        (uint pairBCurrentTime, uint pairBOtherTime) = PriceOracle.getOracleTime(pairAddress);
        
        uint pairATimeTillExpire = pairACurrentTime + PriceOracle.priceValidEnd();
        uint pairATimeTillValid = pairACurrentTime + PriceOracle.priceValidStart();
        uint pairBTimeTillExpire = pairBCurrentTime + PriceOracle.priceValidEnd();
        uint pairBTimeTillValid = pairBCurrentTime + PriceOracle.priceValidStart();
        //Check if weth/gfi price time till valid is greater than pairAddress time till expires
        if ( pairATimeTillValid > pairBTimeTillExpire) {
            //Check if pairBs other time till valid is less than pairAs current time till expire
            if (pairBOtherTime + PriceOracle.priceValidStart() < pairATimeTillExpire){
                //If this is true, then we want to use pairBs other saved timestamp
                pairBTimeTillExpire = pairBOtherTime + PriceOracle.priceValidEnd();
                pairBTimeTillValid = pairBOtherTime + PriceOracle.priceValidStart();
            }
            //potentially add an else statment, not sure if you would ever make it here though
        }
        // Check if pairAddress price time till valid is greater than weth/gfi time till expires
        else if ( pairBTimeTillValid > pairATimeTillExpire){
            //Check if pairAs other time till valid is less than pairBs current time till expire
            if (pairAOtherTime + PriceOracle.priceValidStart() < pairBTimeTillExpire){
                //If this is true, then we want to use pairAs other saved timestamp
                pairATimeTillExpire = pairAOtherTime + PriceOracle.priceValidEnd();
                pairATimeTillValid = pairAOtherTime + PriceOracle.priceValidStart();
            }
            //potentially add an else statment, not sure if you would ever make it here though
        }
        //Now set the min time till valid, and max time till expire
        if (pairATimeTillValid > pairBTimeTillValid){
            valid = pairATimeTillValid;
        }
        else {
            valid = pairBTimeTillValid;
        }
        if (pairATimeTillExpire < pairBTimeTillExpire){
            expires = pairATimeTillExpire;
        }
        else {
            expires = pairBTimeTillExpire;
        }
    }

    /**
    * @dev emitted whenever whitelist address calls either the oracle or manual ProcessEarnings
    * @param pairAddress the address of the pair that just had it's earnings processed
    * @param timestamp the timestamp for when the earnings were processed
    **/
    event earningsProcessed(address pairAddress, uint timestamp);
    /**
    * @dev Will revert if prices are not valid, validTimeWindow() should be called before calling any functions that use price oracles to get min amounts
    * known inefficiency if target pair is wETH/GFI, it will trade all the wETH for GFI, then swap half the GFI back into wETH
    * @param pairAddress the address of the pair that you want to handle earnings for
    **/
    function oracleProcessEarnings(address pairAddress) external onlyWhitelist {
        address token0 = IUniswapV2Pair(pairAddress).token0();
        address token1 = IUniswapV2Pair(pairAddress).token1();
        uint256 minAmount;
        uint256 timeTillValid;
        uint256 slippage = Factory.slippage();
        address[] memory path = new address[](2);
        uint256 earnings = IUniswapV2Pair(pairAddress).handleEarnings(); //Delegates Earnings to a holding contract, and holding approves earnings manager to spend earnings
        require(
            OZ_IERC20(Factory.weth()).transferFrom(
                IUniswapV2Pair(pairAddress).HOLDING_ADDRESS(),
                address(this),
                earnings
            ),
            "Failed to transfer wETH from holding to EM"
        );
        uint256[] memory amounts = new uint256[](2);
        //First swap wETH into GFI
        address firstPairAddress =
            Factory.getPair(Factory.weth(), Factory.gfi());
        (minAmount, timeTillValid) = IPriceOracle(Factory.priceOracle())
            .calculateMinAmount(
            Factory.weth(),
            slippage,
            earnings,
            firstPairAddress
        );
        require(timeTillValid == 0, "Price(s) not valid Call validTimeWindow()");
        path[0] = Factory.weth();
        path[1] = Factory.gfi();
        OZ_IERC20(Factory.weth()).approve(Factory.router(), earnings);
        amounts = IUniswapV2Router02(Factory.router()).swapExactTokensForTokens(
            earnings,
            minAmount,
            path,
            address(this),
            block.timestamp
        );

        //Swap 1/2 GFI into other asset
        (minAmount, timeTillValid) = IPriceOracle(Factory.priceOracle())
            .calculateMinAmount(Factory.gfi(), slippage, (amounts[1] / 2), pairAddress);
        require(timeTillValid == 0, "Price(s) not valid Call validTimeWindow()");
        path[0] = Factory.gfi();
        if (token0 == Factory.gfi()) {
            path[1] = token1;
        } else {
            path[1] = token0;
        }
        //amounts[1] = amounts[1] * 9995 / 10000;
        OZ_IERC20(Factory.gfi()).approve(Factory.router(), (amounts[1] / 2));
        amounts = IUniswapV2Router02(Factory.router()).swapExactTokensForTokens(
            (amounts[1] / 2),
            minAmount,
            path,
            address(this),
            block.timestamp
        );

        //amounts[1] = amounts[1] * 9995 / 10000;
        if(amounts[0] > OZ_IERC20(path[0]).balanceOf(address(this))){
            amounts[0] = OZ_IERC20(path[0]).balanceOf(address(this));
        }
        if(amounts[1] > OZ_IERC20(path[1]).balanceOf(address(this))){
            amounts[1] = OZ_IERC20(path[1]).balanceOf(address(this));
        }
        uint256 token0Var = (slippage * amounts[0]) / 100;
        uint256 token1Var = (slippage * amounts[1]) / 100;
        OZ_IERC20(path[0]).approve(Factory.router(), amounts[0]);
        OZ_IERC20(path[1]).approve(Factory.router(), amounts[1]);
        (token0Var, token1Var,) = IUniswapV2Router02(Factory.router()).addLiquidity(//reuse tokenVars to avoid stack to deep errors
            path[0],
            path[1],
            amounts[0],
            amounts[1],
            token0Var,
            token1Var,
            address(this),
            block.timestamp
        );
        
        IUniswapV2Pair LPtoken = IUniswapV2Pair(pairAddress);
        require(
            LPtoken.destroy(LPtoken.balanceOf(address(this))),
            "Failed to burn LP tokens"
        );
        if((amounts[0] - token0Var) > 0){OZ_IERC20(path[0]).transfer(Factory.dustPan(), (amounts[0] - token0Var));}
        if((amounts[1] - token1Var) > 0){OZ_IERC20(path[1]).transfer(Factory.dustPan(), (amounts[1] - token1Var));}
        emit earningsProcessed(pairAddress, block.timestamp);
    }


    /**
    * @dev to be used if on chain oracle pricing is failing, whitelist address will use their own price oracle to calc minAmounts
    * known inefficiency if target pair is wETH/GFI, it will trade all the wETH for GFI, then swap half the GFI back into wETH
    * @param pairAddress the address of the pair that you want to handle earnings for
    **/
    function manualProcessEarnings(address pairAddress, uint[2] memory minAmounts) external onlyWhitelist{
        uint256 tokenBal;
        uint256 slippage = Factory.slippage();
        address[] memory path = new address[](2);
        uint256 earnings = IUniswapV2Pair(pairAddress).handleEarnings(); //Delegates Earnings to a holding contract, and holding approves earnings manager to spend earnings
        require(
            OZ_IERC20(Factory.weth()).transferFrom(
                IUniswapV2Pair(pairAddress).HOLDING_ADDRESS(),
                address(this),
                earnings
            ),
            "Failed to transfer wETH from holding to EM"
        );

        //So don't even need to call checkPrice here, this will fail if one of the prices isn't valid, so should make a seperate function that makes sure
        uint256[] memory amounts = new uint256[](2);
        //First swap wETH into GFI
        path[0] = Factory.weth();
        path[1] = Factory.gfi();
        OZ_IERC20(Factory.weth()).approve(Factory.router(), earnings);
        amounts = IUniswapV2Router02(Factory.router()).swapExactTokensForTokens(
            earnings,
            minAmounts[0],
            path,
            address(this),
            block.timestamp
        );

        //Swap 1/2 GFI into other asset
        tokenBal = amounts[1] / 2;
        path[0] = Factory.gfi();
        if (IUniswapV2Pair(pairAddress).token0() == Factory.gfi()) {
            path[1] = IUniswapV2Pair(pairAddress).token1();
        } else {
            path[1] = IUniswapV2Pair(pairAddress).token0();
        }
        OZ_IERC20(Factory.gfi()).approve(Factory.router(), (amounts[1] / 2));
        amounts = IUniswapV2Router02(Factory.router()).swapExactTokensForTokens(
            tokenBal,
            minAmounts[1],
            path,
            address(this),
            block.timestamp
        );

        OZ_IERC20 Token0 = OZ_IERC20(path[0]);
        OZ_IERC20 Token1 = OZ_IERC20(path[1]);

        uint256 minToken0 = (slippage * amounts[0]) / 100;
        uint256 minToken1 = (slippage * amounts[1]) / 100;
        Token0.approve(Factory.router(), amounts[0]);
        Token1.approve(Factory.router(), amounts[1]);

        (uint amountA, uint amountB,) = IUniswapV2Router02(Factory.router()).addLiquidity(
            path[0],
            path[1],
            amounts[0],
            amounts[1],
            minToken0,
            minToken1,
            address(this),
            block.timestamp
        );

        IUniswapV2Pair LPtoken = IUniswapV2Pair(pairAddress);
        require(
            LPtoken.destroy(LPtoken.balanceOf(address(this))),
            "Failed to burn LP tokens"
        );
        //Send remaining dust to dust pan
        if((amounts[0] - amountA) > 0){Token0.transfer(Factory.dustPan(), (amounts[0] - amountA));}
        if((amounts[1] - amountB) > 0){Token1.transfer(Factory.dustPan(), (amounts[1] - amountB));}
        emit earningsProcessed(pairAddress, block.timestamp);
    }

    /**
    * @dev should rarely be used, intended use is to collect dust and redistribute it to appropriate swap pools
    * Needed bc the price oracle earnings method has stack too deep errors when adding in transfer to Dust pan
    **/
    function adminWithdraw(address asset) external onlyOwner{
        //emit an event letting everyone know this was used
        OZ_IERC20 token = OZ_IERC20(asset);
        token.transfer(msg.sender, token.balanceOf(address(this)));
        emit AdminWithdrawCalled(asset);
    }
}