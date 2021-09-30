// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/governance/TimelockController.sol";

contract Timelock is TimelockController{
    uint public timelock = 172800; //minimum timelock
    address[] public proposers = [0xa5E5860B34ac0C55884F2D0E9576d545e1c7Dfd4, 0xeb678812778B68a48001B4A9A4A04c4924c33598];
    address[] public executors = [0xeb678812778B68a48001B4A9A4A04c4924c33598];
    constructor() TimelockController(timelock, proposers, executors){}
}