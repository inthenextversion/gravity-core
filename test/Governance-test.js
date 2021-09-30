const { expect } = require("chai");
const { ethers, network, upgrades } = require("hardhat");
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace");

let MockERC20;
let mockWETH;
let MockGFI;
let mockGFI;
let GravityIDO;
let gravityIDO;
let IOU_ADDRESS;
let IOUToken;
let gravityIOU;

//Test wallet addresses
let owner; // Test contract owner
let addr1; // Test user 1
let addr2; // Test user 2
let addr3; // Test user 3
let addr4; // Test user 4

beforeEach(async function () {
    [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockWETH = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockWETH.deployed();  

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockWBTC.deployed();

    MockGFI = await ethers.getContractFactory("GravityToken");
    mockGFI = await MockGFI.deploy("Mock Gravity Finance", "MGFI");
    await mockGFI.deployed();

    Governance = await ethers.getContractFactory("Governance");
    governance = await upgrades.deployProxy(Governance, [mockGFI.address, mockWETH.address, mockWBTC.address], {initializer: 'initialize'});
    await governance.deployed();

    await mockGFI.setGovernanceAddress(governance.address);
    await mockGFI.changeGovernanceForwarding(true);
    await mockGFI.transfer(addr1.address, "300000000000000000000000000");
    await mockGFI.transfer(addr2.address, "300000000000000000000000000");
    await mockGFI.transfer(addr3.address, "300000000000000000000000000");
    await mockGFI.transfer(addr4.address, "300000000000000000000000000");

    //Call claimFee() to update users last fee claim variables
    await governance.connect(addr1).claimFee();
    await governance.connect(addr2).claimFee();
    await governance.connect(addr3).claimFee();
    await governance.connect(addr4).claimFee();
});

describe("Governance Contract functional test", function() {
    it("claimFee() should send caller 1/4 of the wETH rewards ", async function() {
        await mockWETH.connect(addr4).approve(governance.address, "10000000000000000000");
        await governance.connect(addr4).depositFee("1000000000000000000", "0");
        let wETHbal = await mockWETH.balanceOf(addr1.address);
        await governance.connect(addr1).claimFee();
        expect((await mockWETH.balanceOf(addr1.address) - wETHbal).toString()).to.equal("250000000000000000");

        await governance.connect(addr4).depositFee("1000000000000000000", "0");

        //Make sure transfer events properly update the fee ledger
        wETHbal = await mockWETH.balanceOf(addr2.address);
        await mockGFI.connect(addr2).transfer(addr3.address, "150000000000000000000000000");
        await governance.connect(addr2).withdrawFee();
        expect((await mockWETH.balanceOf(addr2.address) - wETHbal).toString()).to.equal("500000000000000000");
        wETHbal = await mockWETH.balanceOf(addr3.address);
        await governance.connect(addr3).withdrawFee();
        expect((await mockWETH.balanceOf(addr3.address) - wETHbal).toString()).to.equal("500000000000000000");

        //Make sure prior transfer increases recipients wETH rewards
        await governance.connect(addr4).depositFee("1000000000000000000", "0");
        wETHbal = await mockWETH.balanceOf(addr3.address);
        await governance.connect(addr3).claimFee();
        expect((await mockWETH.balanceOf(addr3.address) - wETHbal).toString()).to.equal("375000000000000000"); //Would have been 0.25 wETH without prior transfer

        await governance.connect(addr4).updateFee(addr4.address);
        wETHbal = await mockWETH.balanceOf(addr4.address);
        await governance.connect(addr4).withdrawFee();

        expect((await mockWETH.balanceOf(addr4.address) - wETHbal).toString()).to.equal("750000000000000000");
    });

    it("govAuthTransfer() and govAuthTransferFrom() should revert when caller is not the token contract", async function() {
        await expect( governance.govAuthTransfer(owner.address, addr1.address, "1000")).to.be.reverted;
        await expect( governance.govAuthTransferFrom(owner.address, owner.address, addr1.address, "1000")).to.be.reverted;
    });

    it("invalid transfer and transferFrom calls from token contract should be reverted in Governance", async function() {
        await expect( mockGFI.connect(addr2).transfer(addr1.address, "300000000000000000000000001")).to.be.reverted;
        await expect( mockGFI.connect(owner).transferFrom(addr2.address, addr1.address, "300000000000000000000000001")).to.be.reverted;
        await mockGFI.connect(addr2).approve(owner.address, "300000000000000000000000001");
        await expect( mockGFI.connect(owner).transferFrom(addr2.address, addr1.address, "300000000000000000000000001")).to.be.reverted;
    });

});
