// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0;


interface IPathOracle {
    /**
     * Assume claimFee uses msg.sender, and returns the amount of WETH sent to the caller
     */
    function appendPath(address token0, address token1) external;

    function stepPath(address from) external view returns(address to);
}