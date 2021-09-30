// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/OZ_IERC20.sol";
import "../interfaces/IPathOracle.sol";
import "../interfaces/IPriceOracle.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../DeFi/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "../DeFi/uniswapv2/interfaces/IUniswapV2Router02.sol";
import "../interfaces/iGovernance.sol";

contract FeeManager is Ownable {
    address[] public tokenList;
    mapping(address => uint256) public tokenIndex;
    address public factory;
    mapping(address => bool) public whitelist;
    IUniswapV2Factory Factory;
    mapping(address => address) public pathMap;

    modifier onlyWhitelist() {
        require(whitelist[msg.sender], "Caller is not in whitelist!");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "Gravity Finance: FORBIDDEN");
        _;
    }

    /**
    * @dev emitted when owner changes the whitelist
    * @param _address the address that had its whitelist status changed
    * @param newBool the new state of the address
    **/
    event whiteListChanged(address _address, bool newBool);

    /**
    * @dev emitted when catalougeTokens is called by factory
    * @param token0 the first token address of the swap pair
    * @param token1 the second token address of the swap pair
    **/
    event addTokens(address token0, address token1);

    /**
    * @dev emitted when fees are deposited into governance contract
    * @param amountWETH the amount of wETH deposited into the governance contract
    * @param amountWBTC the amount of wBTC deposited into the governance contract
    **/
    event feeDeposited(uint amountWETH, uint amountWBTC);

    /** 
    * @dev emitted when the fee manager makes a swap
    * @param from the address of the token it swapped from
    * @param to the address of the token it swapped into
    **/
    event swapped(address from, address to);

    /** 
    * @dev emitted when owner calls adminWithdraw
    * @param asset the address of the asset that was moved out of the fee manager
    **/
    event AdminWithdrawCalled(address asset);

    constructor(address _factory) {
        tokenList.push(address(0)); //populate the 0 index with the zero address
        factory = _factory;
        Factory = IUniswapV2Factory(factory);
    }

    /**
    * @dev called by owner to change the privelages for an address
    * @param _address the address that you want its privelages changed
    * @param _bool the new privelage for that address
    **/
    function adjustWhitelist(address _address, bool _bool) external onlyOwner {
        whitelist[_address] = _bool;
        emit whiteListChanged(_address, _bool);
    }

    function alterPath(address from, address to) external onlyOwner{
        pathMap[from] = to;
    }

    /**
    * @dev When swap pairs are created, add their tokens to the tokenList if not already in it
    * @param token0 the first token address of the swap pair
    * @param token1 the second token address of the swap pair
    **/
    function catalougeTokens(address token0, address token1) external onlyFactory{
        if (tokenIndex[token0] == 0) {
            tokenList.push(token0);
            tokenIndex[token0] = tokenList.length - 1;
        }

        if (tokenIndex[token1] == 0) {
            tokenList.push(token1);
            tokenIndex[token1] = tokenList.length - 1;
        }
        emit addTokens(token0, token1);
    }

    /** 
    * @dev used to deposit wETH and wBTC into governance contract
    **/
    function deposit() external onlyWhitelist {
        OZ_IERC20 weth = OZ_IERC20(Factory.weth());
        OZ_IERC20 wbtc = OZ_IERC20(Factory.wbtc());
        uint256 amountWETH = weth.balanceOf(address(this));
        uint256 amountWBTC = wbtc.balanceOf(address(this));
        weth.approve(Factory.governor(), amountWETH);
        wbtc.approve(Factory.governor(), amountWBTC);
        iGovernance(Factory.governor()).depositFee(amountWETH, amountWBTC);
        emit feeDeposited(amountWETH, amountWBTC);
    }

    /** 
    * @dev used to get the time window for when it is valid to call oracleStepSwap without reverting
    * @param asset the asset you want to convert into the next asset in the path
    * @return valid expiration the unix timestamp for when price will be valid, and for when it will expire
    **/
    function validTimeWindow(address asset) external returns(uint valid, uint expiration){
        IPriceOracle PriceOracle = IPriceOracle(Factory.priceOracle());
        address nextAsset = IPathOracle(Factory.pathOracle()).stepPath(asset);
        address pairAddress = Factory.getPair(asset, nextAsset);
        
        //Call get price
        PriceOracle.getPrice(pairAddress);

        (uint pairCurrentTime,) = PriceOracle.getOracleTime(pairAddress);
        
        expiration = pairCurrentTime + PriceOracle.priceValidEnd();
        valid = pairCurrentTime + PriceOracle.priceValidStart();
    }

    /** 
    * @dev allows whitelist addresses to swap assets using oracles
    * @param asset the address of the token you want to swap for the next asset in the PathOracle pathMap
    * @param half a bool indicating whether or not to only swap half of the amount of the asset
    **/
    function oracleStepSwap(address asset, bool half) external onlyWhitelist{
        uint tokenBal = OZ_IERC20(asset).balanceOf(address(this));
        if(half){
            tokenBal = tokenBal / 2;
        }
        address[] memory path = new address[](2);
        address nextAsset = pathMap[asset];
        address pairAddress = Factory.getPair(asset, nextAsset);
        (uint minAmount, uint timeTillValid) = IPriceOracle(Factory.priceOracle())
            .calculateMinAmount(asset, Factory.slippage(), tokenBal, pairAddress);
        require(timeTillValid == 0, "Price(s) not valid Call checkPrice()");
        OZ_IERC20(asset).approve(Factory.router(), tokenBal);
        path[0] = asset;
        path[1] = nextAsset;
        IUniswapV2Router02(Factory.router()).swapExactTokensForTokens(
            tokenBal,
            minAmount,
            path,
            address(this),
            block.timestamp
        );
        emit swapped(path[0], path[1]);
    }

    /** 
    * @dev allows whitelist addresses to swap assets by manually providing the minimum amount
    * @param asset the address of the token you want to swap for the next asset in the PathOracle pathMap
    * @param half a bool indicating whether or not to only swap half of the amount of the asset
    * @param minAmount the minimum amount of the other asset the swap exchange should return
    **/
    function manualStepSwap(address asset, bool half, uint minAmount) external onlyWhitelist{
        uint tokenBal = OZ_IERC20(asset).balanceOf(address(this));
        if(half){
            tokenBal = tokenBal / 2;
        }
        address[] memory path = new address[](2);
        address nextAsset = pathMap[asset];
        OZ_IERC20(asset).approve(Factory.router(), tokenBal);
        path[0] = asset;
        path[1] = nextAsset;
        IUniswapV2Router02(Factory.router()).swapExactTokensForTokens(
            tokenBal,
            minAmount,
            path,
            address(this),
            block.timestamp
        );
        emit swapped(path[0], path[1]);
    }

    /** 
    * @dev only called in case of emergency, allows owner to move fees out of fee manager
    * @param asset the address of the asset to move out of fee manager
    **/
    function adminWithdraw(address asset) external onlyOwner{
        OZ_IERC20 token = OZ_IERC20(asset);
        token.transfer(msg.sender, token.balanceOf(address(this)));
        emit AdminWithdrawCalled(asset);
    }
}