// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "../interfaces/IIDOFactory.sol";
import "../interfaces/IIDO_NFT_FCFS_Agreement.sol";
import "../interfaces/ITierManager.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

/**
 * @title Basic IDO contract for NFTs that offers GFI Tier presale, and First Come First Serve Model
 * @author crispymangoes
 * @notice Actual IDO contract is a minimal proxy implementation deployed by the IDO Factory
 */
contract IDO_NFT_FCFS is Initializable, ERC721Holder {
    IIDOFactory private Factory;
    IERC721 private IDOToken;
    IERC20 private saleToken;
    IIDO_NFT_FCFS_Agreement private Agreement;
    address public AgreementAddress;
    mapping(address => uint) public contribution;
    uint public currentNFT;
    uint public fundsRaised;//How much of the sale token has been rasied in the sale
    uint public commissionAlreadyPaid;

    /**
     * @notice emitted when an NFT is bought
     * @param buyer the address of the person who bought the NFT
     * @param tokenId the token id of the NFT that was bought
     */
    event Sale(address buyer, uint tokenId);

    /// @notice modifier used so the privilaged functions can be called by Gravity OR 3rd party
    modifier onlySudo() {
        require(msg.sender == Agreement.GFISudoUser() || msg.sender == Agreement.clientSudoUser(), 'Gravity Finance: Forbidden');
        _;
    }

    /**
     * @notice called by the IDO factory upon creation to set global variable state
     * @dev can only be called ONCE
     * @param agreement the address of the agreement for this IDO
     */
    function initializeIDO(address agreement) external initializer {
        AgreementAddress = agreement;
        Agreement = IIDO_NFT_FCFS_Agreement(agreement);
        saleToken = IERC20(Agreement.saleToken());
        IDOToken = IERC721(Agreement.IDOToken());
        Factory = IIDOFactory(msg.sender);
        currentNFT = Agreement.nftIndex();
    }

    /****************** External Priviledged Functions ******************/
    /**
     * @notice Privelaged function that allows Gravity or 3rd party to withdraw procedes from the sale
     * @dev no time require, because this function can be called as much as needed
     */
    function withdraw() external onlySudo {
        //send commission to feeManager
        uint gravityCommission = saleToken.balanceOf(address(this)) * Agreement.commission() / Agreement.percentDecimals();
        if((gravityCommission + commissionAlreadyPaid) > Agreement.commissionCap()){
            gravityCommission = Agreement.commissionCap() - commissionAlreadyPaid;
        }
        commissionAlreadyPaid += gravityCommission;
        SafeERC20.safeTransfer(saleToken, Agreement.GFIcommission(), gravityCommission);
        
        //send remaining sale token balance to 3rd party
        SafeERC20.safeTransfer(saleToken, Agreement.treasury(), saleToken.balanceOf(address(this)));
    }

    /****************** External State Changing Functions ******************/
    /**
     * @notice How users join the IDO
     * @notice allows GFI tier holders early access to the sale
     * @dev limits Tx purchase amounts during presale, based off getMaxMint function
     * @dev if roundDelay(0) time has passed since IDO started, GFI Tiers are not looked at at all
     * and the only limit applied is the whaleStopper require check
     * @param _amount the number of NFTs you want to buy
     */
    function join(
        uint256 _amount
    ) external {
        require(_amount > 0, "_amount must be non zero");
        require(_amount <= Agreement.whaleStopper(), "Purchase amount too large");
        if(block.timestamp < (Agreement.saleStart() + Agreement.roundDelay(0))){//need to look at tiers
            uint userTier = ITierManager(Factory.tierManager()).checkTierIncludeSnapshot(msg.sender);
            if(Agreement.staggeredStart()){require( block.timestamp >= (Agreement.saleStart() + Agreement.roundDelay(userTier)), "User Tier Must Wait");}
            uint maxMint = getMaxMint(msg.sender);
            require(_amount <= maxMint, "_amount excedes users max amount");
        }
        //transfer _amount into IDO
        uint saleTokensOwed = _amount * Agreement.price();
        SafeERC20.safeTransferFrom(saleToken, msg.sender, address(this), saleTokensOwed);
        //give user their NFTs
        for(uint i=0; i<_amount; i++){
            IDOToken.safeTransferFrom(address(this), msg.sender, currentNFT);
            emit Sale(msg.sender, currentNFT);
            currentNFT+=1;
        }
        contribution[msg.sender] += _amount;//store the total number of NFTs the user has bought
        fundsRaised += saleTokensOwed;//record the total amount of sale tokens the sale has raised
    }

    /****************** Public State Reading Functions ******************/
    /**
     * @notice view function that returns how many NFTs an address can buy
     * @dev more efficient to pass in userTier to this function instead of address, but easier for front end to pass in an address
     * @dev if returned value is 1000000000 that means there is no purchase limit
    */
    function getMaxMint(address _caller) public view returns(uint maxMint) {
        if(block.timestamp < (Agreement.saleStart() + Agreement.roundDelay(0))){//need to look at tiers
            uint userTier = ITierManager(Factory.tierManager()).checkTierIncludeSnapshot(_caller);
            for(uint i=3; i>0; i--){
                if ( block.timestamp >= (Agreement.saleStart() + Agreement.roundDelay(i)) ){
                    maxMint += Agreement.maxPerRound(userTier);
                }
                else{
                    break;
                }
            }
            maxMint = maxMint - contribution[_caller];
        }
        else{
            maxMint = Agreement.whaleStopper();//user mint is only limited by whaleStopper
        }
    }

    /**
     * @notice view function that tells a user what event tier they will have for this IDO
     */
    function userEventTier(address _caller) public view returns(uint tier){
        tier = ITierManager(Factory.tierManager()).checkTierIncludeSnapshot(_caller);
    }
}
