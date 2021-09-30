// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/OZ_IERC20.sol";
import "../DeFi/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../DeFi/uniswapv2/libraries/UQ112x112.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PriceOracle is Ownable{
    using UQ112x112 for uint224;
    uint8 public constant RESOLUTION = 112;
    struct uq112x112 {
        uint224 _x;
    }

    struct oracle {
        uint[2] price0Cumulative;
        uint[2] price1Cumulative;
        uint32[2] timeStamp;
        uint8 index; // 0 or 1
    }

    mapping(address => oracle) public priceOracles; // Maps a pair address to a price oracle


    uint public priceValidStart;
    uint public priceValidEnd;

    /**
    * @dev emitted when owner calls setTimingReq
    * @param priceValidStart how long it takes for a price to become valid from when it is logged
    * @param priceValidEnd how long it takes for the price to expire from when it is logged
    **/
    event priceWindowChanged(uint priceValidStart, uint priceValidEnd);



    constructor(uint _priceValidStart, uint _priceValidEnd) {
        _checkSuggestedPriceWindow(_priceValidStart, _priceValidEnd);
        priceValidStart = _priceValidStart;
        priceValidEnd = _priceValidEnd;
    }

    /**
    * @dev called by owner to change the price valid window
    * @param _priceValidStart how many seconds it takes for the price to become valid
    * @param _priceValidEnd hwo many seconds it takes for a price to expire from when it is logged
    **/
    function setTimingReq(uint _priceValidStart, uint _priceValidEnd) external onlyOwner{
        _checkSuggestedPriceWindow(_priceValidStart, _priceValidEnd);
        priceValidStart = _priceValidStart; 
        priceValidEnd = _priceValidEnd;
        emit priceWindowChanged(priceValidStart, priceValidEnd);
    }

    function _checkSuggestedPriceWindow(uint _priceValidStart, uint _priceValidEnd) internal pure {
        require(_priceValidStart >= 300, "Price maturity must be greater than 300 seconds");
        require(_priceValidStart <= 3600, "Price maturity must be less than 3600 seconds");
        require(_priceValidStart * 2 == _priceValidEnd, "Price expiration must be equal to 2x price maturity");
    }

    /** 
    * @dev called to get the current prices for a swap pair, if not valid, then it logs the current price so that it can become valid
    * @param pairAddress the pair address caller wants the pair prices for
    * @return price0Average , price1Average, timeTillValid 3 uints the average price for asset 0 to asset 1 and vice versa, and the timeTillValid which is how many seconds until prices are valid
    **/
    function getPrice(address pairAddress) public returns (uint price0Average, uint price1Average, uint timeTillValid) {
        uint8 index = priceOracles[pairAddress].index;
        uint8 otherIndex;
        uint8 tempIndex;
        if (index == 0){
            otherIndex = 1;
        }
        else {
            otherIndex = 0;
        }
        //Check if current index is expired
        if (priceOracles[pairAddress].timeStamp[index] + priceValidEnd < currentBlockTimestamp()) {
            (
                priceOracles[pairAddress].price0Cumulative[index],
                priceOracles[pairAddress].price1Cumulative[index],
                priceOracles[pairAddress].timeStamp[index]
            ) = currentCumulativePrices(pairAddress);   
            //Check if other index isnt expired
            if(priceOracles[pairAddress].timeStamp[otherIndex] + priceValidEnd > currentBlockTimestamp()){
                //If it hasn't expired, switch the indexes
                tempIndex = index;
                index = otherIndex;
                otherIndex = tempIndex;
            }
            //Now look at the current index, and figure out how long it is until it is valid
            require(priceOracles[pairAddress].timeStamp[index] + priceValidEnd > currentBlockTimestamp(), "Logic error index assigned incorrectly!");
            if (priceOracles[pairAddress].timeStamp[index] + priceValidStart > currentBlockTimestamp()){
                //Current prices have not matured, so wait until they do
                timeTillValid = (priceOracles[pairAddress].timeStamp[index] + priceValidStart) - currentBlockTimestamp();
            }
            else{
                timeTillValid = 0;
            } 
        }
        else {
            if (priceOracles[pairAddress].timeStamp[index] + priceValidStart > currentBlockTimestamp()){
                //Current prices have not matured, so wait until they do
                timeTillValid = (priceOracles[pairAddress].timeStamp[index] + priceValidStart) - currentBlockTimestamp();
            }
            else{
                timeTillValid = 0;
            } 
            if(priceOracles[pairAddress].timeStamp[otherIndex] + priceValidEnd < currentBlockTimestamp() && priceOracles[pairAddress].timeStamp[index] + priceValidStart < currentBlockTimestamp()){
                //If the other index is expired, and the current index is valid, then set other index = to current info
                (
                priceOracles[pairAddress].price0Cumulative[otherIndex],
                priceOracles[pairAddress].price1Cumulative[otherIndex],
                priceOracles[pairAddress].timeStamp[otherIndex]
            ) = currentCumulativePrices(pairAddress);
            }
        }
        if (timeTillValid == 0){//If prices are valid, set price0Average, and price1Average
            (uint256 price0Cumulative, uint256 price1Cumulative, uint32 timeStamp) =
            currentCumulativePrices(pairAddress);
            uint32 timeElapsed = timeStamp - priceOracles[pairAddress].timeStamp[index];
            price0Average = uint256((10**18 *uint224((price0Cumulative - priceOracles[pairAddress].price0Cumulative[index]) /timeElapsed)) / 2**112);
            price1Average =  uint256((10**18 *uint224((price1Cumulative - priceOracles[pairAddress].price1Cumulative[index]) /timeElapsed)) / 2**112);
        }
    }

    /**
    * @dev get the current timestamp from the price oracle, as well as the alternate timestamp
    * @param pairAddress the pair address you want to check the timestamps for
    * @return currentTimestamp otherTimestamp, the current and the alternate timestamps
    **/
    function getOracleTime(address pairAddress) external view returns(uint currentTimestamp, uint otherTimestamp){
        oracle memory tmp = priceOracles[pairAddress];
        if (tmp.index == 0){
            currentTimestamp = tmp.timeStamp[0];
            otherTimestamp = tmp.timeStamp[1];
        }
        else {
            currentTimestamp = tmp.timeStamp[1];
            otherTimestamp = tmp.timeStamp[0];
        }
    }

    /**
    * @dev used to calculate the minimum amount to recieve from a swap
    * @param from the token you want to swap for another token
    * @param slippage number from 0 to 100 that represents a percent, will revert if greater than 100
    * @param amount the amount of from tokens you want swapped into the other token
    * @param pairAddress the pairAddress you want to use for swapping
    * @return minAmount timeTillValid the minimum amount to expect for a trade, and the time until the price is valid. If timeTillValid is greater than 0 DO NOT USE THE minAmount variable, it will be 0
    **/
    function calculateMinAmount(
        address from,
        uint256 slippage,
        uint256 amount,
        address pairAddress
    ) public returns (uint minAmount, uint timeTillValid) {
        require(pairAddress != address(0), "Pair does not exist!");
        require(slippage <= 100, "Slippage should be a number between 0 -> 100");
        (,, timeTillValid) = getPrice(pairAddress);
        if (timeTillValid == 0){
            uint8 index = priceOracles[pairAddress].index;
            uint256 TWAP;
            IUniswapV2Pair Pair = IUniswapV2Pair(pairAddress);
            (uint256 price0Cumulative, uint256 price1Cumulative, uint32 timeStamp) =
                currentCumulativePrices(pairAddress);
            uint32 timeElapsed = timeStamp - priceOracles[pairAddress].timeStamp[index];
            if (Pair.token0() == from) {
                TWAP = uint256((10**18 *uint224((price0Cumulative - priceOracles[pairAddress].price0Cumulative[index]) /timeElapsed)) / 2**112);
                minAmount = (slippage * TWAP * amount) / 10**20; //Pair price must be within slippage req
            } else {
                TWAP = uint256((10**18 *uint224((price1Cumulative - priceOracles[pairAddress].price1Cumulative[index]) /timeElapsed)) / 2**112);
                minAmount = (slippage * TWAP * amount) / 10**20; //Pair price must be within slippage req
            }
        }
    }

    /** 
    * @dev internal function used to make the block.timestamp into a uint32
    **/
    function currentBlockTimestamp() internal view returns (uint32) {
        return uint32(block.timestamp % 2**32);
    }

    /**
    * @dev produces the cumulative price using counterfactuals to save gas and avoid a call to sync.
    * @param pair the pair address you want the prices for
    **/
    function currentCumulativePrices(address pair)
        internal
        view
        returns (
            uint256 price0Cumulative,
            uint256 price1Cumulative,
            uint32 blockTimestamp
        )
    {
        blockTimestamp = currentBlockTimestamp();
        price0Cumulative = IUniswapV2Pair(pair).price0CumulativeLast();
        price1Cumulative = IUniswapV2Pair(pair).price1CumulativeLast();

        // if time has elapsed since the last update on the pair, mock the accumulated price values
        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) =
            IUniswapV2Pair(pair).getReserves();
        if (blockTimestampLast != blockTimestamp) {
            // subtraction overflow is desired
            uint32 timeElapsed = blockTimestamp - blockTimestampLast;
            // addition overflow is desired
            // counterfactual
            price0Cumulative +=
                uint256(UQ112x112.encode(reserve1).uqdiv(reserve0)) *
                timeElapsed;
            price1Cumulative +=
                uint256(UQ112x112.encode(reserve0).uqdiv(reserve1)) *
                timeElapsed;
        }
    }

}