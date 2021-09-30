// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract GravityToken is ERC20, Ownable {
    address public GOVERNANCE_ADDRESS;
    iGovernance private governor;
    bool public applyGovernanceForwarding;

    constructor(string memory _name, string memory _symbol)
        ERC20(_name, _symbol)
    {
        _mint(msg.sender, 12 * (10**26));
    }

    function setGovernanceAddress(address _address) external onlyOwner {
        GOVERNANCE_ADDRESS = _address;
        governor = iGovernance(GOVERNANCE_ADDRESS);
    }

    function changeGovernanceForwarding(bool _bool) external onlyOwner {
        applyGovernanceForwarding = _bool;
    }

    function transfer(address recipient, uint256 amount)
        public
        override
        returns (bool)
    {
        if (applyGovernanceForwarding) {
            require(governor.govAuthTransfer(msg.sender, recipient, amount), "Governor transfer failed!");
        }

        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override returns (bool) {
        if (applyGovernanceForwarding) {
            require(governor.govAuthTransferFrom(msg.sender, sender, recipient, amount), "Governor transferFrom failed!");
        }

        _transfer(sender, recipient, amount);
        uint256 currentAllowance = allowance(sender, _msgSender()); //Had to change this because error thrown with _allowances
        //uint256 currentAllowance = _allowances[sender][_msgSender()]; //Original OpenZeppelin Line
        require(
            currentAllowance >= amount,
            "ERC20: transfer amount exceeds allowance"
        );
        _approve(sender, _msgSender(), currentAllowance - amount);
        return true;
    }

    function burn(uint256 _amount) external returns (bool) {
        _burn(msg.sender, _amount);
        return true;
    }
}

interface iGovernance {
    function govAuthTransfer(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool); // calls governanceTransfer after fee ledger update

    function govAuthTransferFrom(
        address original_sender,
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool); // calls governanceTransferFrom after fee ledger update
}