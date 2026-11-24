// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Plain ERC-20 used by the tests (decimals configurable, 6 like USDG by default).
contract GentpayTestToken {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
        totalSupply += v;
        emit Transfer(address(0), to, v);
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        emit Approval(msg.sender, s, v);
        return true;
    }

    function transfer(address to, uint256 v) external virtual returns (bool) {
        _move(msg.sender, to, v);
        return true;
    }

    function transferFrom(address f, address to, uint256 v) external virtual returns (bool) {
        _spend(f, v);
        _move(f, to, v);
        return true;
    }

    function _spend(address f, uint256 v) internal {
        uint256 a = allowance[f][msg.sender];
        require(a >= v, "allowance");
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
    }

    function _move(address f, address to, uint256 v) internal virtual {
        require(balanceOf[f] >= v, "balance");
        balanceOf[f] -= v;
        balanceOf[to] += v;
        emit Transfer(f, to, v);
    }
}

/// USDT-style: transferFrom returns nothing.
contract GentpayNoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
    }

    function approve(address s, uint256 v) external {
        allowance[msg.sender][s] = v;
    }

    function transferFrom(address f, address to, uint256 v) external {
        require(allowance[f][msg.sender] >= v && balanceOf[f] >= v, "nope");
        allowance[f][msg.sender] -= v;
        balanceOf[f] -= v;
        balanceOf[to] += v;
    }
}

/// Returns false instead of reverting, and moves nothing.
contract GentpayFalseToken is GentpayTestToken {
    constructor() GentpayTestToken("False", "FALSE", 18) {}

    function transferFrom(address, address, uint256) external pure override returns (bool) {
        return false;
    }
}

/// Takes a 1% fee on every transfer.
contract GentpayFeeToken is GentpayTestToken {
    constructor() GentpayTestToken("Fee", "FEE", 18) {}

    function _move(address f, address to, uint256 v) internal override {
        require(balanceOf[f] >= v, "balance");
        uint256 fee = v / 100;
        balanceOf[f] -= v;
        balanceOf[to] += v - fee;
        totalSupply -= fee;
    }
}

/// Issuer blocklist (like the owner powers seen on many stablecoins): blocked addresses can neither send nor receive.
contract GentpayBlockToken is GentpayTestToken {
    mapping(address => bool) public blocked;

    constructor() GentpayTestToken("Block", "BLK", 6) {}

    function setBlocked(address a, bool b) external {
        blocked[a] = b;
    }

    function _move(address f, address to, uint256 v) internal override {
        require(!blocked[f] && !blocked[to], "blocked");
        super._move(f, to, v);
    }
}

interface GentpayIPayLike {
    function pay(uint256, uint256, uint64, bytes32, uint128) external returns (uint256);
}

/// Calls back into pay() from inside transferFrom.
contract GentpayReentrantToken is GentpayTestToken {
    address public target;
    uint256 public taskId;
    uint256 public providerId;
    bool public armed;
    bool public reentered;
    bytes public lastError;

    constructor() GentpayTestToken("Re", "RE", 18) {}

    function arm(address t, uint256 task, uint256 provider) external {
        target = t;
        taskId = task;
        providerId = provider;
        armed = true;
    }

    function transferFrom(address f, address to, uint256 v) external override returns (bool) {
        if (armed) {
            armed = false;
            reentered = true;
            try GentpayIPayLike(target).pay(taskId, providerId, 1, keccak256("re-entry"), type(uint128).max) {} catch (bytes memory e) {
                lastError = e;
            }
        }
        _spend(f, v);
        _move(f, to, v);
        return true;
    }
}
