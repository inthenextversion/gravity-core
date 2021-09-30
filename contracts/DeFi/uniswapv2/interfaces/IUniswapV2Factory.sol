// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.5.0;

interface IUniswapV2Factory {
    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    function feeToSetter() external view returns (address);
    function migrator() external view returns (address);
    function weth() external view returns (address);
    function wbtc() external view returns (address);
    function gfi() external view returns (address);
    function earningsManager() external view returns (address);
    function feeManager() external view returns (address);
    function dustPan() external view returns (address);
    function governor() external view returns (address);
    function priceOracle() external view returns (address);
    function pathOracle() external view returns (address);
    function router() external view returns (address);
    function paused() external view returns (bool);
    function slippage() external view returns (uint);


    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);

    function createPair(address tokenA, address tokenB) external returns (address pair);

    function setFeeToSetter(address) external;
    function setMigrator(address) external;
}
