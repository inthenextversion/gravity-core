// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "../interfaces/IIDO_NFT_FCFS_Agreement.sol";

/**
 * @title Basic IDO Agreement contract for NFTs that offers GFI Tier presale, and First Come First Serve Model
 * @author crispymangoes
 * @notice Actual IDO Agreement contract is a minimal proxy implementation deployed by the IDO Factory
 */
contract IDO_NFT_FCFS_Agreement is Initializable, IIDO_NFT_FCFS_Agreement{
    bool public override locked; /// @dev bool used to irreversibly lock agreement once finalzed 
    address public override owner; /// @dev address of the owner of the agreement 
    uint constant public override percentDecimals = 10000; /// @dev shows percision

    address public override IDOImplementation; /// @dev address of the IDO implementation to use for IDO logic 
    address public override IDOToken; /// @dev address of the token the IDO is selling 
    address public override saleToken; /// @dev address of the token participants use to buy the IDO token 
    uint public override price; /// @dev the price of the IDO token w/r/t the sale token ie 0.000025 wETH/GFI 
    uint public override totalAmount; /// @dev the total amount of tokens to be sold in the sale be mindful of decimals 
    uint public override saleStart; /// @dev timestamp for when sale starts 
    uint public override commission; /// @dev number from 0 -> 10000 representing 00.00% -> 100.00% commission for the sale s
    address public override GFIcommission; /// @dev where commission is sent 
    address public override treasury; /// @dev where sale procedes are sent
    address public override GFISudoUser; /// @dev Gravity Finance address with elevated IDO privelages 
    address public override clientSudoUser; /// @dev Client address with elevated IDO privelages 
    uint[4] public override roundDelay; /// @dev determines what times rounds start
    uint[4] public override maxPerRound; /// @dev max amount a tier can buy per round
    bool public override staggeredStart; /// @dev controls whether all gfi tiers can mint at the same time(if false), or if tier 3 is allowed to mint before tier 2 and so on(true)
    uint public override nftIndex; /// @dev index of the lowest token ID in the IDO contract
    uint public override whaleStopper; /// @dev controls the max amount of tokens that can be bought per Tx
    uint public override commissionCap; /// @dev caps the amount of commission Gravity can take

    /**
     * @notice modifier used to make sure variables are immutable once locked
     */
    modifier checkLock() {
        require(!locked, 'Gravity Finance: Agreement locked');
        _;
    }

    /**
     * @notice modifier used to make all functions only callable by privelaged address
     */
    modifier onlyOwner(){
        require(msg.sender == owner, 'Gravity Finance: Caller not owner');
        _;
    }

    /**
     * @notice called by IDO factory upon creation
     * @dev only callable ONCE
     */
    function initialize(address _owner, address _IDOImplementation) external override initializer{
        owner = _owner;
        GFISudoUser = _owner; //make the owner of this contract a sudo for the IDO contract
        IDOImplementation = _IDOImplementation;
    }

    /****************** External Priviledged Functions ******************/
    /**
     * @notice used to lock variables as long as they pass several logic require checks
     */
    function lockVariables() external onlyOwner checkLock{
        require(GFIcommission != address(0), 'Gravity Finance: Commission address not set');
        require(IDOToken != address(0), 'Gravity Finance: IDO Token address not set');
        require(saleToken != address(0), 'Gravity Finance: sale Token address not set');
        require(price > 0, 'Gravity Finance: Price not set');
        require(saleStart > 0, 'Gravity Finance: saleStart not set');
        require(commission > 0 && commission <= 10000, 'Gravity Finance: Comission not correct');
        require(clientSudoUser != address(0), 'Gravity Finance: Client Sudo User not set');
        require(treasury != address(0), 'Gravity Finance: Treasury not set');
        require(whaleStopper > 0, 'Gravity Finance: whaleStopper not set');
        require(commissionCap > 0, 'Gravity Finance: commissionCap not set');
        locked = true;
    }

    function setGFICommission(address _address) external onlyOwner checkLock{
        GFIcommission = _address;
    }

    function setIDOToken(address _IDOToken) external onlyOwner checkLock{
        IDOToken = _IDOToken;
    }

    function setSaleToken(address _saleToken) external onlyOwner checkLock{
        saleToken = _saleToken;
    }

    function setPrice(uint _price) external onlyOwner checkLock{
        price = _price;
    }

    function setTotalAmount(uint _totalAmount) external onlyOwner checkLock{
        totalAmount = _totalAmount;
    }

    function setSaleStart(uint _saleStart) external onlyOwner checkLock{
        saleStart = _saleStart;
    }

    function setCommission(uint _commission) external onlyOwner checkLock{
        commission = _commission;
    }

    function adjustClientSudoUsers(address _address) external onlyOwner checkLock{
        clientSudoUser = _address;
    }

    function setTreasury(address _address) external onlyOwner checkLock{
        treasury = _address;
    }

    function adjustRoundDelay(uint[4] memory _delay) external onlyOwner checkLock{
        require(_delay[3] <= _delay[2] && _delay[2] <= _delay[1] && _delay[1] <= _delay[0], "Delays must be equal or in descending order");
        roundDelay = _delay;
    }

    function adjustMaxPerRound(uint[4] memory _max) external onlyOwner checkLock{
        require(_max[3] >= _max[2] && _max[2] >= _max[1] && _max[1] >= _max[0], "Max must be equal or go in ascending order");
        maxPerRound = _max;
    }

    function adjustStaggeredStart(bool _state) external onlyOwner checkLock{
        staggeredStart = _state;
    }

    function adjustNFTIndex(uint _starting) external onlyOwner checkLock{
        nftIndex = _starting;
    }

    function setWhaleStopper(uint _amount) external onlyOwner checkLock{
        whaleStopper = _amount;
    }

    function setCommissionCap(uint _cap) external onlyOwner checkLock{
        commissionCap = _cap;
    }
}