// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IDOAgreement} from "./IDOAgreement.sol";
import "../interfaces/IIDOAgreement.sol";
import "../interfaces/IFarmFactory.sol";
import "../interfaces/ICompounderFactory.sol";

interface IbaseIDOImplementation{
    function initializeIDO(address) external;
}


/**
 * @title The IDO factory creates Agreements, and IDOs using openzeppelin Clones library
 * @author crispymangoes
 */
contract IDOFactory is Ownable {
    mapping(bytes32 => bool) IDOValid;
    address[] public allIDOs;
    address public lastAgreement;

    address public farmFactory;
    address public compounderFactory;
    address public tierManager;
    mapping(address => bool) isIDO;

    struct ContractPackage{
        address IDOImplementation;
        address AgreementImplementation;
    }

    mapping(bytes32 => ContractPackage) public productList;

    /**
     * @notice emitted when new contract package is created
     * @param IDOtype a string identier used to distinguish between IDO types
     * @param version uint version number, so IDOtypes can be revised and improved upon
     * @param newIDOImplementation address to use for IDO implementation logic
     * @param requiredAgreement address to use for Agreement implementation logic
     */
    event ContractPackageCreated( string IDOtype, uint version, address newIDOImplementation, address requiredAgreement);

    /**
     * @notice emitted when updateSharedVariables is called
     * @notice emits the NEW variables
     */
    event SharedVariablesUpdated(address _tierManager, address _farmFactory, address _compounderFactory);

    /// @notice modifier used so that only IDOs can create farms and Compounders
    modifier onlyIDO() {
        require(isIDO[msg.sender], 'Gravity Finance: Forbidden');
        _;
    }

    constructor(address _tierManager) {
        tierManager = _tierManager;
    }

    /****************** External Priviledged Functions ******************/
    /**
     * @notice owner function to change the tier manager, farm factory, and compounder factory
     */
    function updateSharedVariables(address _tierManager, address _farmFactory, address _compounderFactory) external onlyOwner{
        tierManager = _tierManager;
        farmFactory = _farmFactory;
        compounderFactory = _compounderFactory;
        emit SharedVariablesUpdated(_tierManager, _farmFactory, _compounderFactory);
    }

    /**
     * @notice allows owner to add new IDO implementations and Agreement implementations
     * @dev IDOtype + version needs to be unique
     */
    function addNewIDOType(string memory IDOtype, uint version, address newIDOImplementation, address requiredAgreement)
        external
        onlyOwner
    {
        require(
            newIDOImplementation != address(0),
            "Gravity Finance: Can not make zero address and implementation"
        );
        require(
            requiredAgreement != address(0),
            "Gravity Finance: Can not make zero address and Agreement"
        );
        bytes32 record = getContractPackageID(IDOtype, version);
        
        //check if IDOtype already exists, sufficient check to just check if IDOImplementation is zero address
        // since above requires make it so that no ContractPackage can have zero address contracts
        require(productList[record].IDOImplementation == address(0), 'Gravity Finance: IDO Type already exists');
        
        productList[record] = ContractPackage({
            IDOImplementation: newIDOImplementation,
            AgreementImplementation: requiredAgreement
        });

        emit ContractPackageCreated(IDOtype, version, newIDOImplementation, requiredAgreement);
    }

    /**
     * @notice allows owner to approve or revoke IDO approval
     * @notice allows a 3rd party to retain control of IDO tokens 
     * if they need to be sent on IDO initialization
     */
    function approveOrRejectIDO(
        bool status,
        address from,
        address agreement
    ) external onlyOwner{
        bytes32 _hash = keccak256(
            abi.encodePacked(
                from,
                agreement
            )
        );
        IDOValid[_hash] = status;
    }

    /**
     * @notice First step in the IDO creation process
     * owner creates an agreement, finalizes it(by locking it)
     * then calls approveOrRejectIDO
     * finally the 3rd party must actually create the IDO
     */
    function createAgreement(string memory IDOtype, uint version) external onlyOwner{
        //create the agreement
        bytes32 record = getContractPackageID(IDOtype, version);
        address AgreementImplementation = productList[record].AgreementImplementation;
        address agreement = Clones.clone(AgreementImplementation);
        
        //initialize the agreement
        IIDOAgreement(agreement).initialize(msg.sender, productList[record].IDOImplementation);
        lastAgreement = agreement;
    }

    /**
     * @notice allows IDOs to create Gravity Finance farms 
     */
    function deployFarm(address _depositToken, address _rewardToken, uint _amount, uint _blockReward, uint _start, uint _end, uint _bonusEnd, uint _bonus) external onlyIDO{
        //create a farm
        IERC20(_rewardToken).approve(farmFactory, _amount);
        IFarmFactory(farmFactory).createFarm(_depositToken, _rewardToken, _amount, _blockReward, _start, _end, _bonusEnd, _bonus);
    }

    /**
     * @notice allows IDOs to create Gravity Finance compounder vaults
     */
    function deployCompounder(address _farmAddress, address _depositToken, address _rewardToken, uint _maxCallerReward, uint _callerFee, uint _minHarvest, bool _lpFarm, address _lpA, address _lpB) external onlyIDO{
        //create the compounder
        ICompounderFactory(compounderFactory).createCompounder(_farmAddress, _depositToken, _rewardToken, 100, _maxCallerReward, _callerFee, _minHarvest, _lpFarm, _lpA, _lpB);
    }

    /****************** External State Changing Functions ******************/
    /**
     * @notice called by the 3rd party to actually create their IDO contract
     * @notice the agreement for this IDO must be locked
     */
    function createIDO(address agreement) external {
        bytes32 _hash = _getIDOHash(msg.sender, agreement);
        require(IDOValid[_hash], 'Gravity Finance: IDO parameters not valid');
        IDOValid[_hash] = false;
        IIDOAgreement Agreement = IIDOAgreement(agreement);
        require(Agreement.locked(), 'Gravity Finance: Agreement not locked!');
        bytes32 salt = keccak256(abi.encodePacked(Agreement.IDOToken(), Agreement.saleToken(), block.timestamp));
        address IDOClone = Clones.cloneDeterministic(Agreement.IDOImplementation(), salt);
        IbaseIDOImplementation(IDOClone).initializeIDO(agreement);
        allIDOs.push(IDOClone);
        isIDO[IDOClone] = true;
    }

    /****************** Public Pure Functions ******************/
    /**
     * @dev helper function to get the bytes32 var used to interact with productList
     */
    function getContractPackageID(string memory name, uint version) public pure returns(bytes32 contractPackageID){
            contractPackageID = keccak256(abi.encodePacked(name, version));
    }

    /****************** Internal Pure Functions ******************/
    /**
     * @dev helper function used to get bytes32 hash for IDO creation
     */
    function _getIDOHash(
        address from,
        address agreement
    ) internal pure returns (bytes32 _hash) {
        _hash = keccak256(
            abi.encodePacked(
                from,
                agreement
            )
        );
    }
}
