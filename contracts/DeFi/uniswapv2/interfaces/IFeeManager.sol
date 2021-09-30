// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;


interface IFeeManager {
    /**
     * Assume claimFee uses msg.sender, and returns the amount of WETH sent to the caller
     */
    function catalougeTokens(address token0, address token1) external;

}