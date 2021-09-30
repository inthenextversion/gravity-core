// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import '../DeFi/uniswapv2/interfaces/IUniswapV2Factory.sol';

/**
* @dev OWNER SHOULD CALL alterPath(weth, wbtc) after deployment to set the final path properly
**/
contract PathOracle is Ownable {
    mapping(address => address) public pathMap;
    address[] public favoredAssets;
    address public factory;
    IUniswapV2Factory Factory;

    struct node{
        address token;
        bool notLeaf;
    }
    /**
    * @dev emitted when the owner manually alters a path
    * @param fromAsset the token address that is the input into pathMap
    * @param toAsset the token address that is the output from pathMap
    **/
    event pathAltered(address fromAsset, address toAsset);

    /**
    * @dev emitted when a new pair is created, and their addresses are added to pathMap
    * @param leaf the token address of the asset with no other addresses pointed to it(as of this event)
    * @param branch the token address of the asset which the leaf points to
    **/
    event pathAppended(address leaf, address branch);

    event FactoryChanged(address newFactory);

    constructor(address[] memory _favored) {
        require(favoredAssets.length <= 10, 'Gravity Finance: Favored Assets array too large');
        favoredAssets = _favored;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "Gravity Finance: FORBIDDEN");
        _;
    }

    function setFavored(address[] memory _favored) external onlyOwner{
        require(favoredAssets.length <= 10, 'Gravity Finance: Favored Assets array too large');
        favoredAssets = _favored;
    }

    /**
    * @dev called by owner to manually change the path mapping
    * @param fromAsset the token address used as the input for pathMap
    * @param toAsset the token address that is the output of pathMap
    **/
    function alterPath(address fromAsset, address toAsset) external onlyOwner {
        pathMap[fromAsset] = toAsset;
        emit pathAltered(fromAsset, toAsset);
    }

    /**
    * @dev view function used to get the output from pathMap if from is the input 
    * @param from the address you are going from
    * @return to the address from steps you to
    **/
    function stepPath(address from) public view returns(address to){
        to = pathMap[from];
    }

    /**
    * @dev called by owner to change the factory address
    * @param _address the new factory address
    **/
    function setFactory(address _address) external onlyOwner {
        factory = _address;
        Factory = IUniswapV2Factory(factory);
        emit FactoryChanged(factory);
    }

    /**
    * @dev called by newly created pairs, basically check if either of the pairs are in the favored list, or if they have a pair with a favored list asset
    * @param token0 address of the first token in the pair
    * @param token1 address of the second token in the pair
    **/
    function appendPath(address token0, address token1) external onlyFactory {
        bool inFavored = false;
        //First Check if either of the tokens are in the favored list
        for (uint i=0; i < favoredAssets.length; i++){
            if (token0 == favoredAssets[i]){
                pathMap[token1] = token0; //Swap token1 for token0
                inFavored = true;
                emit pathAppended(token1, token0);
                break;
            }

            else if (token1 == favoredAssets[i]){
                pathMap[token0] = token1; //Swap token0 for token1
                inFavored = true;
                emit pathAppended(token0, token1);
                break;
            }
        }
        //If neither of the tokens are in the favored list, then see if either of them have pairs with a token in the favored list
        if (!inFavored){
            for (uint i=0; i < favoredAssets.length; i++){
                if (Factory.getPair(token0, favoredAssets[i]) != address(0)){
                    pathMap[token1] = token0; //Swap token1 for token0
                    pathMap[token0] = favoredAssets[i];
                    emit pathAppended(token1, token0);
                    break;
                }

                else if (Factory.getPair(token1, favoredAssets[i]) != address(0)){
                    pathMap[token0] = token1; //Swap token0 for token1
                    pathMap[token1] = favoredAssets[i];
                    emit pathAppended(token0, token1);
                    break;
                }
            }
        }
    }
}