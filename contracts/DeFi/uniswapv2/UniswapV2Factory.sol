// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.6.12;

import './interfaces/IUniswapV2Factory.sol';
import './UniswapV2Pair.sol';
import './interfaces/IPathOracle.sol';
import './interfaces/IEarningsManager.sol';
import './interfaces/IFeeManager.sol';
//import "../../utils/Context.sol";

contract UniswapV2Factory is IUniswapV2Factory {

    //Global Variables used by all swap pairs, managers, and oracles
    address public override feeToSetter;
    address public override migrator;
    address public override router;
    address public override governor;//Should never change
    address public override weth;//Should never change
    address public override wbtc;//Should never change
    address public override gfi;//Should never change
    address public override pathOracle;
    address public override priceOracle;
    address public override earningsManager;
    address public override feeManager;
    address public override dustPan;
    bool public override paused;
    uint public override slippage;

    mapping(address => mapping(address => address)) public override getPair;
    address[] public override allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    event AddressChanged(address oldAddress, address newAddress);

    event PausedChanged(bool newState);

    event SlippageUpdated(uint newSlippage);

    constructor(address _feeToSetter, address _gfi, address _weth, address _wbtc) public {
        feeToSetter = _feeToSetter;
        gfi = _gfi;
        weth = _weth;
        wbtc = _wbtc;
    }

    function allPairsLength() external override view returns (uint) {
        return allPairs.length;
    }

    function pairCodeHash() external pure returns (bytes32) {
        return keccak256(type(UniswapV2Pair).creationCode);
    }

    function createPair(address tokenA, address tokenB) external override returns (address pair) {
        require(router != address(0), "Gravity Finance: Router not set");
        require(tokenA != tokenB, 'Gravity Finance: IDENTICAL_ADDRESSES');
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), 'Gravity Finance: ZERO_ADDRESS');
        require(getPair[token0][token1] == address(0), 'Gravity Finance: PAIR_EXISTS'); // single check is sufficient
        bytes memory bytecode = type(UniswapV2Pair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        UniswapV2Pair(pair).initialize(token0, token1);
        IPathOracle(pathOracle).appendPath(token0, token1);
        IFeeManager(feeManager).catalougeTokens(token0, token1);
        if(token0 == gfi || token1 == gfi){ //Only add pairs that has GFI as one of the tokens, otehrwise they won't have any earnings
            IEarningsManager(earningsManager).addSwapPair(pair);
        }
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setMigrator(address _migrator) external override {
        require(msg.sender == feeToSetter, 'Gravity Finance: FORBIDDEN');
        emit AddressChanged(migrator, _migrator);
        migrator = _migrator;
    }

    function setFeeToSetter(address _feeToSetter) external override {
        require(msg.sender == feeToSetter, 'Gravity Finance: FORBIDDEN');
        emit AddressChanged(feeToSetter, _feeToSetter);
        feeToSetter = _feeToSetter;
    }

    function setRouter(address _router) external {
        require(msg.sender == feeToSetter, 'Gravity Finance: FORBIDDEN');
        emit AddressChanged(router, _router);
        router = _router;
    }

    function setGovernor(address _governor) external {
        require(msg.sender == feeToSetter, 'Gravity Finance: FORBIDDEN');
        emit AddressChanged(governor, _governor);
        governor = _governor;
    }

    function setPathOracle(address _pathOracle) external {
        require(msg.sender == feeToSetter, 'Gravity Finance: FORBIDDEN');
        emit AddressChanged(pathOracle, _pathOracle);
        pathOracle = _pathOracle;
    }

    function setPriceOracle(address _priceOracle) external {
        require(msg.sender == feeToSetter, 'Gravity Finance: FORBIDDEN');
        emit AddressChanged(priceOracle, _priceOracle);
        priceOracle = _priceOracle;
    }

    function setEarningsManager(address _earningsManager) external {
        require(msg.sender == feeToSetter, 'Gravity Finance: FORBIDDEN');
        emit AddressChanged(earningsManager, _earningsManager);
        earningsManager = _earningsManager;
    }

    function setFeeManager(address _feeManager) external {
        require(msg.sender == feeToSetter, 'Gravity Finance: FORBIDDEN');
        emit AddressChanged(feeManager, _feeManager);
        feeManager = _feeManager;
    }

    function setDustPan(address _dustPan) external {
        require(msg.sender == feeToSetter, 'Gravity Finance: FORBIDDEN');
        emit AddressChanged(dustPan, _dustPan);
        dustPan = _dustPan;
    }

    function setPaused(bool _paused) external {
        require(msg.sender == feeToSetter, 'Gravity Finance: FORBIDDEN');
        paused = _paused;
        emit PausedChanged(paused);
    }

    function setSlippage(uint _slippage) external {
        require(msg.sender == feeToSetter, 'Gravity Finance: FORBIDDEN');
        slippage = _slippage;
        emit SlippageUpdated(slippage);
    }
}
