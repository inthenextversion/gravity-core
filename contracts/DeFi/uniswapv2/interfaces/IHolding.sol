// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;


interface IHolding {
    /**
     * Assume claimFee uses msg.sender, and returns the amount of WETH sent to the caller
     */
    function approveEM(address TOKEN_ADDRESS, address EM_ADDRESS, uint amount) external;
}