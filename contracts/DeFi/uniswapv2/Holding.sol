// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

import "./interfaces/OZ_IERC20.sol";
import "./libraries/SafeMath.sol";

contract Holding {
    using SafeMathUniswap for uint256;

    address public SWAP_ADDRESS;

    modifier onlySwap() {
        require(msg.sender == SWAP_ADDRESS, "Gravity Finance: FORBIDDEN");
        _;
    }

    constructor() public {
        SWAP_ADDRESS = msg.sender;
    }

    function approveEM(address TOKEN_ADDRESS, address EM_ADDRESS, uint amount)external onlySwap{
        OZ_IERC20(TOKEN_ADDRESS).approve(EM_ADDRESS, amount);
    }
    
}
