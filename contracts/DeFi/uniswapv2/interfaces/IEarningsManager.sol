// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;


interface IEarningsManager {
    /**
     * Assume claimFee uses msg.sender, and returns the amount of WETH sent to the caller
     */
    function addSwapPair(address pairAddress) external;
}