const { expect } = require("chai");
const { ethers, network } = require("hardhat");
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

    MockGFI = await ethers.getContractFactory("GravityToken");
    mockGFI = await MockGFI.deploy("Mock Gravity Finance", "MGFI");
    await mockGFI.deployed();

    GravityIDO = await ethers.getContractFactory("GravityIDO");
    gravityIDO = await GravityIDO.deploy(mockWETH.address, mockGFI.address, 0, true);
    await gravityIDO.deployed();

    IOU_ADDRESS = await gravityIDO.getIOUAddress();

    IOUToken = await ethers.getContractFactory("IOUToken");
    gravityIOU = await IOUToken.attach(IOU_ADDRESS);

});

describe("GravityIDO presale functional test", function() {
    it("Should return IOU address", async function() {
        expect( await gravityIDO.connect(addr1).getIOUAddress()).to.equal(IOU_ADDRESS);
    });

    it("setWETH_ADDRESS() should revert when caller is not owner", async function() {
        await expect(gravityIDO.connect(addr1).setWETH_ADDRESS(addr1.address)).to.be.reverted;
    });

    it("setWETH_ADDRESS() should allow owner to change it before sale starts", async function() {
        await gravityIDO.connect(owner).setWETH_ADDRESS(addr1.address);
        expect( await gravityIDO.getWETH_ADDRESS()).to.equal(addr1.address);
    });

    it("setGFI_ADDRESS() should revert when caller is not owner", async function() {
        await expect(gravityIDO.connect(addr1).setGFI_ADDRESS(addr1.address)).to.be.reverted;
    });

    it("setGFI_ADDRESS() should allow owner to change it before sale starts", async function() {
        await gravityIDO.connect(owner).setGFI_ADDRESS(addr1.address);
        expect( await gravityIDO.getGFI_ADDRESS()).to.equal(addr1.address);
    });

    it("withdrawAll() should allow owner to call it as long as no IOUs have been minted", async function() {
        await gravityIDO.connect(owner).withdrawAll();
    });

    it("withdrawAll() should revert when caller is not owner", async function() {
        await expect(gravityIDO.connect(addr1).withdrawAll()).to.be.reverted;
    });

    it("withdraw() should revert when caller is not owner", async function() {
        await expect(gravityIDO.connect(addr1).withdraw()).to.be.reverted;
    });

    it("withdraw() should revert when sale has not begun", async function() {
        await expect(gravityIDO.connect(owner).withdraw()).to.be.reverted;
    });

    it("buyStake() should revert when sale has not begun", async function() {
        await expect(gravityIDO.connect(addr1).buyStake("100000000000000000")).to.be.reverted;
    });

    it("claimStake() should revert when sale has not begun", async function() {
        await expect(gravityIDO.connect(addr1).claimStake()).to.be.reverted;
    });


});

describe("GravityIDO during sale functional test", function() {
    beforeEach(async function () {
        //Advance time to during the sale
        await network.provider.send("evm_increaseTime", [600]);
        await network.provider.send("evm_mine");
    
    });

    it("setWETH_ADDRESS() should revert when IDO has already started", async function() {
        await expect(gravityIDO.connect(owner).setWETH_ADDRESS(addr1.address)).to.be.reverted;
    });

    it("setGFI_ADDRESS() should revert when IDO has already started", async function() {
        await expect(gravityIDO.connect(owner).setGFI_ADDRESS(addr1.address)).to.be.reverted;
    });

    it("withdraw() should revert when sale is ongoing", async function() {
        await expect(gravityIDO.connect(owner).withdraw()).to.be.reverted;
    });

    it("claimStake() should revert when sale is ongoing", async function() {
        await expect(gravityIDO.connect(addr1).claimStake()).to.be.reverted;
    });

    it("buyStake() should revert when IDO contract does not hold enough GFI to cover the sale", async function() {
        await expect(gravityIDO.connect(addr1).buyStake("100000000000000000")).to.be.reverted;
    });

    it("buyStake() should revert when _amount is 0", async function() {
        await mockGFI.connect(owner).transfer(gravityIDO.address, "40000000000000000000000000");// Transfeer 40,000,000 GFI to IDO
        await expect(gravityIDO.connect(addr1).buyStake("0")).to.be.reverted;
    });

    it("buyStake() should revert when WETH transferFrom fails", async function() {
        await mockGFI.connect(owner).transfer(gravityIDO.address, "40000000000000000000000000");// Transfeer 40,000,000 GFI to IDO
        await expect(gravityIDO.connect(addr1).buyStake("100000000000000000")).to.be.reverted;
    });

    it("buyStake() should accept WETH and send caller IOU tokens", async function() {
        await mockGFI.connect(owner).transfer(gravityIDO.address, "40000000000000000000000000");// Transfeer 40,000,000 GFI to IDO
        await mockWETH.connect(addr1).approve(gravityIDO.address, "100000000000000000");
        let userWETHbefore = await mockWETH.balanceOf(addr1.address);
        let userIOUbefore = await gravityIOU.balanceOf(addr1.address);
        await gravityIDO.connect(addr1).buyStake("100000000000000000");
        let userWETHafter = await mockWETH.balanceOf(addr1.address);
        let userIOUafter = await gravityIOU.balanceOf(addr1.address);
        expect( userWETHbefore - userWETHafter).to.equal(100000000000000000); //Check WETH was taken from caller
        expect( userIOUafter - userIOUbefore).to.equal(100000000000000000); //Check caller recieved IOU
        expect( await mockWETH.balanceOf(gravityIDO.address)).to.equal("100000000000000000"); //Check contract got the WETH
        expect( await gravityIDO.getTotalWETHCollected()).to.equal("100000000000000000"); //Check totalWETHCollected updated properly
    });

    it("buyStake() should revert if _amount > 0.5", async function() {
        await mockGFI.connect(owner).transfer(gravityIDO.address, "40000000000000000000000000");// Transfeer 40,000,000 GFI to IDO
        await mockWETH.connect(addr1).approve(gravityIDO.address, "100000000000000000");
        await expect(gravityIDO.connect(addr1).buyStake("500000000000000001")).to.be.reverted;
    });

    it("buyStake() should revert if two calls from same caller total _amount > 0.5 ", async function() {
        await mockGFI.connect(owner).transfer(gravityIDO.address, "40000000000000000000000000");// Transfeer 40,000,000 GFI to IDO
        await mockWETH.connect(addr1).approve(gravityIDO.address, "1000000000000000000");
        await gravityIDO.connect(addr1).buyStake("250000000000000001");
        await expect(gravityIDO.connect(addr1).buyStake("250000000000000000")).to.be.reverted;
    });

    it("withdrawAll() should revert if IOU totalSupply() > 0", async function() {
        await mockGFI.connect(owner).transfer(gravityIDO.address, "40000000000000000000000000");// Transfeer 40,000,000 GFI to IDO
        await mockWETH.connect(addr1).approve(gravityIDO.address, "100000000000000000");
        await gravityIDO.connect(addr1).buyStake("100000000000000000");
        await expect(gravityIDO.connect(owner).withdrawAll()).to.be.reverted;
    });
});

describe("GravityIDO after sale functional test UNDER SUBSCRIBED", function() {
    beforeEach(async function () { 
        //Advance time to during the sale
        await network.provider.send("evm_increaseTime", [600]);
        await network.provider.send("evm_mine");

        await mockGFI.connect(owner).transfer(gravityIDO.address, "40000000000000000000000000");// Transfeer 40,000,000 GFI to IDO
        await mockWETH.connect(addr2).approve(gravityIDO.address, "500000000000000000");

        await gravityIDO.connect(addr2).buyStake("500000000000000000");

        //Advance time to after the sale
        await network.provider.send("evm_increaseTime", [87000]);
        await network.provider.send("evm_mine");
    });

    it("buyStake() should revert if called after sale end", async function() {
        await mockWETH.connect(addr1).approve(gravityIDO.address, "1000000000000000000");
        await expect(gravityIDO.connect(addr1).buyStake("250000000000000001")).to.be.reverted;
    });

    it("claimStake() should revert if caller has no IOUs to claim", async function() {
        //Advance time to after the 30 min setup window
        await network.provider.send("evm_increaseTime", [1800]);
        await network.provider.send("evm_mine");
        await expect(gravityIDO.connect(owner).claimStake()).to.be.reverted;
    });

    it("claimStake() should revert if IOU transferFrom fails", async function() {
        //Advance time to after the 30 min setup window
        await network.provider.send("evm_increaseTime", [1800]);
        await network.provider.send("evm_mine");
        await expect(gravityIDO.connect(addr2).claimStake()).to.be.reverted;
    });

    it("claimStake() should revert if called before end of 30 min setup window", async function() {
        await expect(gravityIDO.connect(addr2).claimStake()).to.be.reverted;
    });

    it("claimStake() should accept 0.5 GFI_IDO, burn it, and return 20,000 GFI to caller", async function() {
        //Advance time to after the 30 min setup window
        await network.provider.send("evm_increaseTime", [1800]);
        await network.provider.send("evm_mine");
        await gravityIOU.connect(addr2).approve(gravityIDO.address, "5000000000000000000");
        let IOUsupplyBefore = await gravityIOU.totalSupply()/1000000000000000;
        let userGFIbefore = await mockGFI.balanceOf(addr2.address)/1000000000000000;
        await gravityIDO.connect(addr2).claimStake();
        expect(IOUsupplyBefore - 500).to.equal(await gravityIOU.totalSupply()/1000000000000000); //Check if IOUs were burned
        expect(userGFIbefore + 20000000).to.equal(await mockGFI.balanceOf(addr2.address)/1000000000000000); //Check if user recieved correct amount of GFI
    });

    it("withdraw() should callable by owner. 0.5WETH should go to Treasury, and 39,980,000 GFI should Promotion fund", async function() {
        await gravityIDO.connect(owner).withdraw();
        expect(await mockGFI.balanceOf("0x8c7887BA91b359BC574525F05Cc403F51858c2E4")/1000000000000000).to.equal(39980000000); //Check if IOUs were burned
        expect(await mockWETH.balanceOf("0xE471f43De327bF352b5E922FeA92eF6D026B4Af0")/1000000000000000).to.equal(500); //Check if user recieved correct amount of GFI
    });
});

describe("GravityIDO after sale functional test OVER SUBSCRIBED", function() {
    beforeEach(async function () { 
        GravityIDO = await ethers.getContractFactory("GravityIDO");
        gravityIDO = await GravityIDO.deploy(mockWETH.address, mockGFI.address, "40000000000000000000000", true);
        await gravityIDO.deployed();
    
        IOU_ADDRESS = await gravityIDO.getIOUAddress();
    
        IOUToken = await ethers.getContractFactory("IOUToken");
        gravityIOU = await IOUToken.attach(IOU_ADDRESS);

        //Advance time to during the sale
        await network.provider.send("evm_increaseTime", [600]);
        await network.provider.send("evm_mine");

        await mockGFI.connect(owner).transfer(gravityIDO.address, "40000000000000000000000");// Transfeer 40,000,000 GFI to IDO
        await mockWETH.connect(addr2).approve(gravityIDO.address, "500000000000000000");
        await mockWETH.connect(addr3).approve(gravityIDO.address, "500000000000000000");
        await mockWETH.connect(addr4).approve(gravityIDO.address, "500000000000000000");

        await gravityIDO.connect(addr2).buyStake("500000000000000000");
        await gravityIDO.connect(addr3).buyStake("500000000000000000");
        await gravityIDO.connect(addr4).buyStake("500000000000000000");

        //Advance time to after the sale
        await network.provider.send("evm_increaseTime", [87000]);
        await network.provider.send("evm_mine");
    });

    it("claimStake() should accept 0.5 GFI_IDO from 3 users, burn it, and return 13,333 GFI, and 0.166 WETH to each caller", async function() {
        //Advance time to after the 30 min setup window
        await network.provider.send("evm_increaseTime", [1800]);
        await network.provider.send("evm_mine");

        await gravityIOU.connect(addr2).approve(gravityIDO.address, "5000000000000000000");
        await gravityIDO.connect(addr2).claimStake();

        await gravityIOU.connect(addr3).approve(gravityIDO.address, "5000000000000000000");
        await gravityIDO.connect(addr3).claimStake();

        await gravityIOU.connect(addr4).approve(gravityIDO.address, "5000000000000000000");
        await gravityIDO.connect(addr4).claimStake();

        expect(await mockGFI.balanceOf(addr2.address)/1000000000000000).to.be.above(13333333); // > 13,333.333 GFI
        expect(await mockWETH.balanceOf(addr2.address)/1000000000000000).to.be.above(166); // > 0.166 WETH

        expect(await mockGFI.balanceOf(addr3.address)/1000000000000000).to.be.above(13333333); // > 13,333.333 GFI
        expect(await mockWETH.balanceOf(addr3.address)/1000000000000000).to.be.above(166); // > 0.166 WETH

        expect(await mockGFI.balanceOf(addr4.address)/1000000000000000).to.be.above(13333333); // > 13,333.333 GFI
        expect(await mockWETH.balanceOf(addr4.address)/1000000000000000).to.be.above(166); // > 0.166 WETH
    });

    it("withdraw() should callable by owner. 0.5WETH should go to Treasury, and 39,980,000 GFI should Promotion fund", async function() {
        await gravityIDO.connect(owner).withdraw();
        expect(await mockGFI.balanceOf("0x8c7887BA91b359BC574525F05Cc403F51858c2E4")/1000000000000000).to.equal(0); //Check if IOUs were burned
        expect(await mockWETH.balanceOf("0xE471f43De327bF352b5E922FeA92eF6D026B4Af0")/1000000000000000).to.equal(1000); //Check if user recieved correct amount of GFI
    });
});

describe("IOU Token tests", function() {

    it("mintIOU() should revert if called by any address except for IDO address", async function() {
        await expect(gravityIOU.connect(owner).mintIOU(owner.address, "1000000000000000000")).to.be.reverted;
        await expect(gravityIOU.connect(addr1).mintIOU(owner.address, "1000000000000000000")).to.be.reverted;
        await expect(gravityIOU.connect(addr2).mintIOU(owner.address, "1000000000000000000")).to.be.reverted;
        await expect(gravityIOU.connect(addr3).mintIOU(owner.address, "1000000000000000000")).to.be.reverted;
    });

    it("burnIOU() should revert if called by any address except for IDO address", async function() {
        await expect(gravityIOU.connect(owner).burnIOU(owner.address, "1000000000000000000")).to.be.reverted;
        await expect(gravityIOU.connect(addr1).burnIOU(owner.address, "1000000000000000000")).to.be.reverted;
        await expect(gravityIOU.connect(addr2).burnIOU(owner.address, "1000000000000000000")).to.be.reverted;
        await expect(gravityIOU.connect(addr3).burnIOU(owner.address, "1000000000000000000")).to.be.reverted;
    });
});
