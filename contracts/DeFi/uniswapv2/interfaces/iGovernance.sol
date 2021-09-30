// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0;


interface iGovernance {
    /**
     * Assume claimFee uses msg.sender, and returns the amount of WETH sent to the caller
     */
    function delegateFee(address reciever) external returns (uint256);

    function depositFee(uint256 amountWETH, uint256 amountWBTC) external;
    function tierLedger(address user) external returns(uint[3] memory);
}