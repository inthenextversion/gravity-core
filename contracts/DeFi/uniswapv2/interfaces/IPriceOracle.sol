// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0;


interface IPriceOracle {
    /**
     * Assume claimFee uses msg.sender, and returns the amount of WETH sent to the caller
     */

    struct oracle {
        uint[2] price0Cumulative;
        uint[2] price1Cumulative;
        uint32[2] timeStamp;
        uint8 index; // 0 or 1
    }

    function getPrice(address pairAddress) external returns (uint price0Average, uint price1Average, uint timeTillValid);

    function calculateMinAmount(address from, uint256 slippage, uint256 amount, address pairAddress) external returns (uint minAmount, uint timeTillValid);

    function getOracleTime(address pairAddress) external view returns(uint currentTimestamp, uint otherTimestamp);

    function priceValidStart() external view returns(uint);
    function priceValidEnd() external view returns(uint);
}