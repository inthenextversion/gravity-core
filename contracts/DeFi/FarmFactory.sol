// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FarmV2} from "./FarmV2.sol";
import "../interfaces/IFarmV2.sol";

contract FarmFactory is Ownable{

    address public FarmImplementation;
    mapping(bytes32 => bool) FarmValid;
    mapping(address => mapping(address => mapping(uint => address))) public getFarm;
    mapping(address => mapping(address => uint)) public getFarmIndex;
    mapping(address => mapping(address => uint)) public farmVersion;
    address[] public allFarms;
    mapping(address => bool) public whitelist;
    address public governance;
    address public incinerator;
    uint public harvestFee; // number between 0->5
    address public gfi;
    address public feeManager;
    

    /**
    * @dev emitted when owner changes the whitelist
    * @param _address the address that had its whitelist status changed
    * @param newBool the new state of the address
    **/
    event whiteListChanged(address _address, bool newBool);

    /**
    * @dev emitted when a farm is created
    * @param farmAddress the address of the new farm
    * @param depositToken the address of the deposit token
    * @param rewardToken the address of the reward token
    * @param start the farm starting block
    * @param end the farm end block
    **/
    event FarmCreated(address farmAddress, address depositToken, address rewardToken, uint start, uint end);

    event HarvestFeeChanged(uint newFee);

    event AddressChanged(address oldAddress, address newAddress);

    modifier onlyWhitelist() {
        require(whitelist[msg.sender], "Caller is not in whitelist!");
        _;
    }

    constructor(address _gfi, address _governance) {
        FarmImplementation = address(new FarmV2());
        gfi = _gfi;
        governance = _governance;
    }

    function adjustWhitelist(address _address, bool _bool) external onlyOwner {
        whitelist[_address] = _bool;
        emit whiteListChanged(_address, _bool);
    }

    function setHarvestFee(uint _fee) external onlyOwner{
        require(_fee <= 5, "New fee can not be greater than 5%");
        harvestFee = _fee;
        emit HarvestFeeChanged(harvestFee);
    }

    function setIncinerator(address _incinerator) external onlyOwner{
        emit AddressChanged(incinerator, _incinerator);
        incinerator = _incinerator;
    }

    function setFeeManager(address _feeManager) external onlyOwner{
        emit AddressChanged(feeManager, _feeManager);
        feeManager = _feeManager;
    }

    function setGovernance(address _governance) external onlyOwner{
        emit AddressChanged(governance, _governance);
        governance = _governance;
    }

    /**
    * @dev allows caller to create farm as long as parameters are approved by factory owner
    * Creates a clone of FarmV2 contract, so that farm creation is cheap
    **/
    function createFarm(address depositToken, address rewardToken, uint amount, uint blockReward, uint start, uint end, uint bonusEnd, uint bonus) external {
        //check if caller is on whitelist, used by IDO factory
        if(!whitelist[msg.sender]){
            //require statement to see if caller is able to create farm with given inputs
            bytes32 _hash = _getFarmHash(msg.sender, depositToken, rewardToken, amount, blockReward, start, end, bonusEnd, bonus);
            require(FarmValid[_hash], "Farm parameters are not valid!");
            FarmValid[_hash] = false; //Revoke so caller can not call again
        }

        //Create the clone proxy, and add it to the getFarm mappping, and allFarms array
        farmVersion[depositToken][rewardToken] = farmVersion[depositToken][rewardToken] + 1;
        bytes32 salt = keccak256(abi.encodePacked(depositToken, rewardToken, farmVersion[depositToken][rewardToken]));
        address farmClone = Clones.cloneDeterministic(FarmImplementation, salt);
        getFarm[depositToken][rewardToken][farmVersion[depositToken][rewardToken]] = farmClone;
        getFarmIndex[depositToken][rewardToken] = allFarms.length;
        allFarms.push(farmClone);
        //Fund the farm
        require(IERC20(rewardToken).transferFrom(msg.sender, address(farmClone), amount), "Failed to transfer tokens to back new farm");
        
        //Init the newly created farm
        IFarmV2(farmClone).initialize();
        IFarmV2(farmClone).init(depositToken, rewardToken, amount, blockReward, start, end, bonusEnd, bonus);
        emit FarmCreated(farmClone, depositToken, rewardToken, start, end);
    }

    function _getFarmHash(address from, address depositToken, address rewardToken, uint amount, uint blockReward, uint start, uint end, uint bonusEnd, uint bonus) internal pure returns(bytes32 _hash){
        _hash = keccak256(abi.encodePacked(from, depositToken, rewardToken, amount, blockReward, start, end, bonusEnd, bonus));
    }

    function approveOrRevokeFarm(bool status, address from, address depositToken, address rewardToken, uint amount, uint blockReward, uint start, uint end, uint bonusEnd, uint bonus) external onlyOwner{
        bytes32 _hash = keccak256(abi.encodePacked(from, depositToken, rewardToken, amount, blockReward, start, end, bonusEnd, bonus));
        FarmValid[_hash] = status;
    }

}
