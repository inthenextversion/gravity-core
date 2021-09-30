// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/iGovernance.sol";
import "../interfaces/IFarmFactory.sol";
import "../interfaces/iGravityToken.sol";
import "../DeFi/uniswapv2/interfaces/IUniswapV2Router02.sol";
import "../DeFi/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "../interfaces/IPriceOracle.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Incinerator is Ownable{

    address public gfi;
    address public weth;
    address public swapFactory;
    address public router;
    address public priceOracle;
    uint public slippage;

    constructor(address _gfi, address _weth, address _swapFactory, address _router, address _priceOracle){
        gfi = _gfi;
        weth = _weth;
        swapFactory = _swapFactory;
        router = _router;
        priceOracle = _priceOracle;
    }

    /**
    * @dev allows owner to change the slippage for use with Price Oracle
    * @param _slippage the new slippage value
    **/
    function setSlippage(uint _slippage) external onlyOwner{
        require(slippage <= 100, 'Gravity Finance: INVALID SLIPPAGE');
        slippage = _slippage;
    }

    /** 
    * @dev converts any wETH in contract to GFI and burns it.
    **/
    function convertEarningsToGFIandBurn() external{
        IERC20 WETH = IERC20(weth);
        iGravityToken GFI = iGravityToken(gfi);
        address[] memory path = new address[](2);
        address pairAddress = IUniswapV2Factory(swapFactory).getPair(weth, gfi);
        uint tokenBal = WETH.balanceOf(address(this));
        path[0] = weth;
        path[1] = gfi;
        WETH.approve(router, tokenBal);
        (uint minAmount, uint timeTillValid) = IPriceOracle(priceOracle).calculateMinAmount(weth, slippage, tokenBal, pairAddress);
        if (timeTillValid == 0){
            IUniswapV2Router02(router).swapExactTokensForTokens(
            tokenBal,
            minAmount,
            path,
            address(this),
            block.timestamp
            );
        }

        //Burn all the GFI
        GFI.burn(GFI.balanceOf(address(this)));
    }

    /**
    * @dev same funcitonality as above function, but allows owner to convert wETH into GFI without using price oracle
    * @param minAmount the minimum amount of GFI contract should expect from swapping all of its wETH into GFI
    **/
    function adminConvertEarningsToGFIandBurn(uint minAmount) external onlyOwner{
        IERC20 WETH = IERC20(weth);
        iGravityToken GFI = iGravityToken(gfi);
        address[] memory path = new address[](2);
        uint tokenBal = WETH.balanceOf(address(this));
        path[0] = weth;
        path[1] = gfi;
        WETH.approve(router, tokenBal);
            IUniswapV2Router02(router).swapExactTokensForTokens(
            tokenBal,
            minAmount,
            path,
            address(this),
            block.timestamp
            );

        //Burn all the GFI
        GFI.burn(GFI.balanceOf(address(this)));
    }

}