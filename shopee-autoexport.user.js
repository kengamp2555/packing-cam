// ==UserScript==
// @name         Shopee → Packing Cam: ส่งออกคืนสินค้า + รายรับอัตโนมัติ (+ LnwShop)
// @namespace    packing-cam
// @version      3.35
// @description  คืนสินค้า: รับคำขอจากแอป → Export 30 วัน → ส่งเข้า Drive · รายรับ: เปิดหน้า 'รายรับของฉัน' → ดึงไฟล์โอนแล้ว → นำเข้า FIN_ เอง
// @match        https://seller.shopee.co.th/*
// @match        https://a.lnwstore.com/*
// @match        https://sellercenter.lazada.co.th/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      lazada.co.th
// @connect      fbprivacy.lazada.co.th
// @run-at       document-idle
// @updateURL    https://kengamp2555.github.io/packing-cam/shopee-autoexport.user.js
// @downloadURL  https://kengamp2555.github.io/packing-cam/shopee-autoexport.user.js
// ==/UserScript==

/* ---- ตัวสร้าง QR (ใช้ใส่ QR เลขพัสดุในใบจัดสินค้า LnwShop) ---- */
/* QRCode for JavaScript - Copyright (c) 2009 Kazuhiko Arase - MIT license (http://www.opensource.org/licenses/mit-license.php)
 * "QR Code" is a registered trademark of DENSO WAVE INCORPORATED. Bundled from qrcode-terminal/vendor/QRCode. */
(function(){var M={};function R(n){n=n.replace("./","").replace(".js","");var m=M[n];if(!m.l){m.l=1;m.e={exports:{}};m.f(m.e,R);}return m.e.exports;}
M["QR8bitByte"]={f:function(module,require){var exports=module.exports;
var QRMode = require('./QRMode');

function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = data;
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			// not JIS ...
			buffer.put(this.data.charCodeAt(i), 8);
		}
	}
};

module.exports = QR8bitByte;

}};
M["QRBitBuffer"]={f:function(module,require){var exports=module.exports;
function QRBitBuffer() {
	this.buffer = [];
	this.length = 0;
}

QRBitBuffer.prototype = {

	get : function(index) {
		var bufIndex = Math.floor(index / 8);
		return ( (this.buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
	},
	
	put : function(num, length) {
		for (var i = 0; i < length; i++) {
			this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
		}
	},
	
	getLengthInBits : function() {
		return this.length;
	},
	
	putBit : function(bit) {
	
		var bufIndex = Math.floor(this.length / 8);
		if (this.buffer.length <= bufIndex) {
			this.buffer.push(0);
		}
	
		if (bit) {
			this.buffer[bufIndex] |= (0x80 >>> (this.length % 8) );
		}
	
		this.length++;
	}
};

module.exports = QRBitBuffer;

}};
M["QRErrorCorrectLevel"]={f:function(module,require){var exports=module.exports;
module.exports = {
	L : 1,
	M : 0,
	Q : 3,
	H : 2
};


}};
M["QRMaskPattern"]={f:function(module,require){var exports=module.exports;
module.exports = {
	PATTERN000 : 0,
	PATTERN001 : 1,
	PATTERN010 : 2,
	PATTERN011 : 3,
	PATTERN100 : 4,
	PATTERN101 : 5,
	PATTERN110 : 6,
	PATTERN111 : 7
};

}};
M["QRMath"]={f:function(module,require){var exports=module.exports;
var QRMath = {

	glog : function(n) {
	
		if (n < 1) {
			throw new Error("glog(" + n + ")");
		}
		
		return QRMath.LOG_TABLE[n];
	},
	
	gexp : function(n) {
	
		while (n < 0) {
			n += 255;
		}
	
		while (n >= 256) {
			n -= 255;
		}
	
		return QRMath.EXP_TABLE[n];
	},
	
	EXP_TABLE : new Array(256),
	
	LOG_TABLE : new Array(256)

};
	
for (var i = 0; i < 8; i++) {
	QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
	QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4]
		^ QRMath.EXP_TABLE[i - 5]
		^ QRMath.EXP_TABLE[i - 6]
		^ QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
	QRMath.LOG_TABLE[QRMath.EXP_TABLE[i] ] = i;
}

module.exports = QRMath;

}};
M["QRMode"]={f:function(module,require){var exports=module.exports;
module.exports = {
    MODE_NUMBER :       1 << 0,
    MODE_ALPHA_NUM :    1 << 1,
    MODE_8BIT_BYTE :    1 << 2,
    MODE_KANJI :        1 << 3
};

}};
M["QRPolynomial"]={f:function(module,require){var exports=module.exports;
var QRMath = require('./QRMath');

function QRPolynomial(num, shift) {
	if (num.length === undefined) {
		throw new Error(num.length + "/" + shift);
	}

	var offset = 0;

	while (offset < num.length && num[offset] === 0) {
		offset++;
	}

	this.num = new Array(num.length - offset + shift);
	for (var i = 0; i < num.length - offset; i++) {
		this.num[i] = num[i + offset];
	}
}

QRPolynomial.prototype = {

	get : function(index) {
		return this.num[index];
	},
	
	getLength : function() {
		return this.num.length;
	},
	
	multiply : function(e) {
	
		var num = new Array(this.getLength() + e.getLength() - 1);
	
		for (var i = 0; i < this.getLength(); i++) {
			for (var j = 0; j < e.getLength(); j++) {
				num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i) ) + QRMath.glog(e.get(j) ) );
			}
		}
	
		return new QRPolynomial(num, 0);
	},
	
	mod : function(e) {
	
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}
	
		var ratio = QRMath.glog(this.get(0) ) - QRMath.glog(e.get(0) );
	
		var num = new Array(this.getLength() );
		
		for (var i = 0; i < this.getLength(); i++) {
			num[i] = this.get(i);
		}
		
		for (var x = 0; x < e.getLength(); x++) {
			num[x] ^= QRMath.gexp(QRMath.glog(e.get(x) ) + ratio);
		}
	
		// recursive call
		return new QRPolynomial(num, 0).mod(e);
	}
};

module.exports = QRPolynomial;

}};
M["QRRSBlock"]={f:function(module,require){var exports=module.exports;
var QRErrorCorrectLevel = require('./QRErrorCorrectLevel');

function QRRSBlock(totalCount, dataCount) {
	this.totalCount = totalCount;
	this.dataCount  = dataCount;
}

QRRSBlock.RS_BLOCK_TABLE = [

	// L
	// M
	// Q
	// H

	// 1
	[1, 26, 19],
	[1, 26, 16],
	[1, 26, 13],
	[1, 26, 9],
	
	// 2
	[1, 44, 34],
	[1, 44, 28],
	[1, 44, 22],
	[1, 44, 16],

	// 3
	[1, 70, 55],
	[1, 70, 44],
	[2, 35, 17],
	[2, 35, 13],

	// 4		
	[1, 100, 80],
	[2, 50, 32],
	[2, 50, 24],
	[4, 25, 9],
	
	// 5
	[1, 134, 108],
	[2, 67, 43],
	[2, 33, 15, 2, 34, 16],
	[2, 33, 11, 2, 34, 12],
	
	// 6
	[2, 86, 68],
	[4, 43, 27],
	[4, 43, 19],
	[4, 43, 15],
	
	// 7		
	[2, 98, 78],
	[4, 49, 31],
	[2, 32, 14, 4, 33, 15],
	[4, 39, 13, 1, 40, 14],
	
	// 8
	[2, 121, 97],
	[2, 60, 38, 2, 61, 39],
	[4, 40, 18, 2, 41, 19],
	[4, 40, 14, 2, 41, 15],
	
	// 9
	[2, 146, 116],
	[3, 58, 36, 2, 59, 37],
	[4, 36, 16, 4, 37, 17],
	[4, 36, 12, 4, 37, 13],
	
	// 10		
	[2, 86, 68, 2, 87, 69],
	[4, 69, 43, 1, 70, 44],
	[6, 43, 19, 2, 44, 20],
	[6, 43, 15, 2, 44, 16],

	// 11
	[4, 101, 81],
	[1, 80, 50, 4, 81, 51],
	[4, 50, 22, 4, 51, 23],
	[3, 36, 12, 8, 37, 13],

	// 12
	[2, 116, 92, 2, 117, 93],
	[6, 58, 36, 2, 59, 37],
	[4, 46, 20, 6, 47, 21],
	[7, 42, 14, 4, 43, 15],

	// 13
	[4, 133, 107],
	[8, 59, 37, 1, 60, 38],
	[8, 44, 20, 4, 45, 21],
	[12, 33, 11, 4, 34, 12],

	// 14
	[3, 145, 115, 1, 146, 116],
	[4, 64, 40, 5, 65, 41],
	[11, 36, 16, 5, 37, 17],
	[11, 36, 12, 5, 37, 13],

	// 15
	[5, 109, 87, 1, 110, 88],
	[5, 65, 41, 5, 66, 42],
	[5, 54, 24, 7, 55, 25],
	[11, 36, 12],

	// 16
	[5, 122, 98, 1, 123, 99],
	[7, 73, 45, 3, 74, 46],
	[15, 43, 19, 2, 44, 20],
	[3, 45, 15, 13, 46, 16],

	// 17
	[1, 135, 107, 5, 136, 108],
	[10, 74, 46, 1, 75, 47],
	[1, 50, 22, 15, 51, 23],
	[2, 42, 14, 17, 43, 15],

	// 18
	[5, 150, 120, 1, 151, 121],
	[9, 69, 43, 4, 70, 44],
	[17, 50, 22, 1, 51, 23],
	[2, 42, 14, 19, 43, 15],

	// 19
	[3, 141, 113, 4, 142, 114],
	[3, 70, 44, 11, 71, 45],
	[17, 47, 21, 4, 48, 22],
	[9, 39, 13, 16, 40, 14],

	// 20
	[3, 135, 107, 5, 136, 108],
	[3, 67, 41, 13, 68, 42],
	[15, 54, 24, 5, 55, 25],
	[15, 43, 15, 10, 44, 16],

	// 21
	[4, 144, 116, 4, 145, 117],
	[17, 68, 42],
	[17, 50, 22, 6, 51, 23],
	[19, 46, 16, 6, 47, 17],

	// 22
	[2, 139, 111, 7, 140, 112],
	[17, 74, 46],
	[7, 54, 24, 16, 55, 25],
	[34, 37, 13],

	// 23
	[4, 151, 121, 5, 152, 122],
	[4, 75, 47, 14, 76, 48],
	[11, 54, 24, 14, 55, 25],
	[16, 45, 15, 14, 46, 16],

	// 24
	[6, 147, 117, 4, 148, 118],
	[6, 73, 45, 14, 74, 46],
	[11, 54, 24, 16, 55, 25],
	[30, 46, 16, 2, 47, 17],

	// 25
	[8, 132, 106, 4, 133, 107],
	[8, 75, 47, 13, 76, 48],
	[7, 54, 24, 22, 55, 25],
	[22, 45, 15, 13, 46, 16],

	// 26
	[10, 142, 114, 2, 143, 115],
	[19, 74, 46, 4, 75, 47],
	[28, 50, 22, 6, 51, 23],
	[33, 46, 16, 4, 47, 17],

	// 27
	[8, 152, 122, 4, 153, 123],
	[22, 73, 45, 3, 74, 46],
	[8, 53, 23, 26, 54, 24],
	[12, 45, 15, 28, 46, 16],

	// 28
	[3, 147, 117, 10, 148, 118],
	[3, 73, 45, 23, 74, 46],
	[4, 54, 24, 31, 55, 25],
	[11, 45, 15, 31, 46, 16],

	// 29
	[7, 146, 116, 7, 147, 117],
	[21, 73, 45, 7, 74, 46],
	[1, 53, 23, 37, 54, 24],
	[19, 45, 15, 26, 46, 16],

	// 30
	[5, 145, 115, 10, 146, 116],
	[19, 75, 47, 10, 76, 48],
	[15, 54, 24, 25, 55, 25],
	[23, 45, 15, 25, 46, 16],

	// 31
	[13, 145, 115, 3, 146, 116],
	[2, 74, 46, 29, 75, 47],
	[42, 54, 24, 1, 55, 25],
	[23, 45, 15, 28, 46, 16],

	// 32
	[17, 145, 115],
	[10, 74, 46, 23, 75, 47],
	[10, 54, 24, 35, 55, 25],
	[19, 45, 15, 35, 46, 16],

	// 33
	[17, 145, 115, 1, 146, 116],
	[14, 74, 46, 21, 75, 47],
	[29, 54, 24, 19, 55, 25],
	[11, 45, 15, 46, 46, 16],

	// 34
	[13, 145, 115, 6, 146, 116],
	[14, 74, 46, 23, 75, 47],
	[44, 54, 24, 7, 55, 25],
	[59, 46, 16, 1, 47, 17],

	// 35
	[12, 151, 121, 7, 152, 122],
	[12, 75, 47, 26, 76, 48],
	[39, 54, 24, 14, 55, 25],
	[22, 45, 15, 41, 46, 16],

	// 36
	[6, 151, 121, 14, 152, 122],
	[6, 75, 47, 34, 76, 48],
	[46, 54, 24, 10, 55, 25],
	[2, 45, 15, 64, 46, 16],

	// 37
	[17, 152, 122, 4, 153, 123],
	[29, 74, 46, 14, 75, 47],
	[49, 54, 24, 10, 55, 25],
	[24, 45, 15, 46, 46, 16],

	// 38
	[4, 152, 122, 18, 153, 123],
	[13, 74, 46, 32, 75, 47],
	[48, 54, 24, 14, 55, 25],
	[42, 45, 15, 32, 46, 16],

	// 39
	[20, 147, 117, 4, 148, 118],
	[40, 75, 47, 7, 76, 48],
	[43, 54, 24, 22, 55, 25],
	[10, 45, 15, 67, 46, 16],

	// 40
	[19, 148, 118, 6, 149, 119],
	[18, 75, 47, 31, 76, 48],
	[34, 54, 24, 34, 55, 25],
	[20, 45, 15, 61, 46, 16]
];

QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
	
	var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
	
	if (rsBlock === undefined) {
		throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
	}

	var length = rsBlock.length / 3;
	
	var list = [];
	
	for (var i = 0; i < length; i++) {

		var count = rsBlock[i * 3 + 0];
		var totalCount = rsBlock[i * 3 + 1];
		var dataCount  = rsBlock[i * 3 + 2];

		for (var j = 0; j < count; j++) {
			list.push(new QRRSBlock(totalCount, dataCount) );	
		}
	}
	
	return list;
};

QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {

	switch(errorCorrectLevel) {
	case QRErrorCorrectLevel.L :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
	case QRErrorCorrectLevel.M :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
	case QRErrorCorrectLevel.Q :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
	case QRErrorCorrectLevel.H :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
	default :
		return undefined;
	}
};

module.exports = QRRSBlock;

}};
M["QRUtil"]={f:function(module,require){var exports=module.exports;
var QRMode = require('./QRMode');
var QRPolynomial = require('./QRPolynomial');
var QRMath = require('./QRMath');
var QRMaskPattern = require('./QRMaskPattern');

var QRUtil = {

    PATTERN_POSITION_TABLE : [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],        
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ],

    G15 : (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18 : (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK : (1 << 14) | (1 << 12) | (1 << 10)    | (1 << 4) | (1 << 1),

    getBCHTypeInfo : function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) ) );    
        }
        return ( (data << 10) | d) ^ QRUtil.G15_MASK;
    },

    getBCHTypeNumber : function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) ) );    
        }
        return (data << 12) | d;
    },

    getBCHDigit : function(data) {

        var digit = 0;

        while (data !== 0) {
            digit++;
            data >>>= 1;
        }

        return digit;
    },

    getPatternPosition : function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },

    getMask : function(maskPattern, i, j) {
        
        switch (maskPattern) {
            
        case QRMaskPattern.PATTERN000 : return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001 : return i % 2 === 0;
        case QRMaskPattern.PATTERN010 : return j % 3 === 0;
        case QRMaskPattern.PATTERN011 : return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 === 0;
        case QRMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 === 0;

        default :
            throw new Error("bad maskPattern:" + maskPattern);
        }
    },

    getErrorCorrectPolynomial : function(errorCorrectLength) {

        var a = new QRPolynomial([1], 0);

        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0) );
        }

        return a;
    },

    getLengthInBits : function(mode, type) {

        if (1 <= type && type < 10) {

            // 1 - 9

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 10;
            case QRMode.MODE_ALPHA_NUM  : return 9;
            case QRMode.MODE_8BIT_BYTE  : return 8;
            case QRMode.MODE_KANJI      : return 8;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 27) {

            // 10 - 26

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 12;
            case QRMode.MODE_ALPHA_NUM  : return 11;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 10;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 41) {

            // 27 - 40

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 14;
            case QRMode.MODE_ALPHA_NUM  : return 13;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 12;
            default :
                throw new Error("mode:" + mode);
            }

        } else {
            throw new Error("type:" + type);
        }
    },

    getLostPoint : function(qrCode) {
        
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0; 
        var col = 0;

        
        // LEVEL1
        
        for (row = 0; row < moduleCount; row++) {

            for (col = 0; col < moduleCount; col++) {

                var sameCount = 0;
                var dark = qrCode.isDark(row, col);

                for (var r = -1; r <= 1; r++) {

                    if (row + r < 0 || moduleCount <= row + r) {
                        continue;
                    }

                    for (var c = -1; c <= 1; c++) {

                        if (col + c < 0 || moduleCount <= col + c) {
                            continue;
                        }

                        if (r === 0 && c === 0) {
                            continue;
                        }

                        if (dark === qrCode.isDark(row + r, col + c) ) {
                            sameCount++;
                        }
                    }
                }

                if (sameCount > 5) {
                    lostPoint += (3 + sameCount - 5);
                }
            }
        }

        // LEVEL2

        for (row = 0; row < moduleCount - 1; row++) {
            for (col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row,     col    ) ) count++;
                if (qrCode.isDark(row + 1, col    ) ) count++;
                if (qrCode.isDark(row,     col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count === 0 || count === 4) {
                    lostPoint += 3;
                }
            }
        }

        // LEVEL3

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && 
                        !qrCode.isDark(row, col + 1) && 
                         qrCode.isDark(row, col + 2) && 
                         qrCode.isDark(row, col + 3) && 
                         qrCode.isDark(row, col + 4) && 
                        !qrCode.isDark(row, col + 5) && 
                         qrCode.isDark(row, col + 6) ) {
                    lostPoint += 40;
                }
            }
        }

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) &&
                        !qrCode.isDark(row + 1, col) &&
                         qrCode.isDark(row + 2, col) &&
                         qrCode.isDark(row + 3, col) &&
                         qrCode.isDark(row + 4, col) &&
                        !qrCode.isDark(row + 5, col) &&
                         qrCode.isDark(row + 6, col) ) {
                    lostPoint += 40;
                }
            }
        }

        // LEVEL4
        
        var darkCount = 0;

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) {
                    darkCount++;
                }
            }
        }
        
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;

        return lostPoint;       
    }

};

module.exports = QRUtil;

}};
M["index"]={f:function(module,require){var exports=module.exports;
//---------------------------------------------------------------------
// QRCode for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//   http://www.opensource.org/licenses/mit-license.php
//
// The word "QR Code" is registered trademark of 
// DENSO WAVE INCORPORATED
//   http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------
// Modified to work in node for this project (and some refactoring)
//---------------------------------------------------------------------

var QR8bitByte = require('./QR8bitByte');
var QRUtil = require('./QRUtil');
var QRPolynomial = require('./QRPolynomial');
var QRRSBlock = require('./QRRSBlock');
var QRBitBuffer = require('./QRBitBuffer');

function QRCode(typeNumber, errorCorrectLevel) {
	this.typeNumber = typeNumber;
	this.errorCorrectLevel = errorCorrectLevel;
	this.modules = null;
	this.moduleCount = 0;
	this.dataCache = null;
	this.dataList = [];
}

QRCode.prototype = {
	
	addData : function(data) {
		var newData = new QR8bitByte(data);
		this.dataList.push(newData);
		this.dataCache = null;
	},
	
	isDark : function(row, col) {
		if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
			throw new Error(row + "," + col);
		}
		return this.modules[row][col];
	},

	getModuleCount : function() {
		return this.moduleCount;
	},
	
	make : function() {
		// Calculate automatically typeNumber if provided is < 1
		if (this.typeNumber < 1 ){
			var typeNumber = 1;
			for (typeNumber = 1; typeNumber < 40; typeNumber++) {
				var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);

				var buffer = new QRBitBuffer();
				var totalDataCount = 0;
				for (var i = 0; i < rsBlocks.length; i++) {
					totalDataCount += rsBlocks[i].dataCount;
				}

				for (var x = 0; x < this.dataList.length; x++) {
					var data = this.dataList[x];
					buffer.put(data.mode, 4);
					buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
					data.write(buffer);
				}
				if (buffer.getLengthInBits() <= totalDataCount * 8)
					break;
			}
			this.typeNumber = typeNumber;
		}
		this.makeImpl(false, this.getBestMaskPattern() );
	},
	
	makeImpl : function(test, maskPattern) {
		
		this.moduleCount = this.typeNumber * 4 + 17;
		this.modules = new Array(this.moduleCount);
		
		for (var row = 0; row < this.moduleCount; row++) {
			
			this.modules[row] = new Array(this.moduleCount);
			
			for (var col = 0; col < this.moduleCount; col++) {
				this.modules[row][col] = null;//(col + row) % 3;
			}
		}
	
		this.setupPositionProbePattern(0, 0);
		this.setupPositionProbePattern(this.moduleCount - 7, 0);
		this.setupPositionProbePattern(0, this.moduleCount - 7);
		this.setupPositionAdjustPattern();
		this.setupTimingPattern();
		this.setupTypeInfo(test, maskPattern);
		
		if (this.typeNumber >= 7) {
			this.setupTypeNumber(test);
		}
	
		if (this.dataCache === null) {
			this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
		}
	
		this.mapData(this.dataCache, maskPattern);
	},

	setupPositionProbePattern : function(row, col)  {
		
		for (var r = -1; r <= 7; r++) {
			
			if (row + r <= -1 || this.moduleCount <= row + r) continue;
			
			for (var c = -1; c <= 7; c++) {
				
				if (col + c <= -1 || this.moduleCount <= col + c) continue;
				
				if ( (0 <= r && r <= 6 && (c === 0 || c === 6) ) || 
                     (0 <= c && c <= 6 && (r === 0 || r === 6) ) || 
                     (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
					this.modules[row + r][col + c] = true;
				} else {
					this.modules[row + r][col + c] = false;
				}
			}		
		}		
	},
	
	getBestMaskPattern : function() {
	
		var minLostPoint = 0;
		var pattern = 0;
	
		for (var i = 0; i < 8; i++) {
			
			this.makeImpl(true, i);
	
			var lostPoint = QRUtil.getLostPoint(this);
	
			if (i === 0 || minLostPoint >  lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}
	
		return pattern;
	},
	
	createMovieClip : function(target_mc, instance_name, depth) {
	
		var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
		var cs = 1;
	
		this.make();

		for (var row = 0; row < this.modules.length; row++) {
			
			var y = row * cs;
			
			for (var col = 0; col < this.modules[row].length; col++) {
	
				var x = col * cs;
				var dark = this.modules[row][col];
			
				if (dark) {
					qr_mc.beginFill(0, 100);
					qr_mc.moveTo(x, y);
					qr_mc.lineTo(x + cs, y);
					qr_mc.lineTo(x + cs, y + cs);
					qr_mc.lineTo(x, y + cs);
					qr_mc.endFill();
				}
			}
		}
		
		return qr_mc;
	},

	setupTimingPattern : function() {
		
		for (var r = 8; r < this.moduleCount - 8; r++) {
			if (this.modules[r][6] !== null) {
				continue;
			}
			this.modules[r][6] = (r % 2 === 0);
		}
	
		for (var c = 8; c < this.moduleCount - 8; c++) {
			if (this.modules[6][c] !== null) {
				continue;
			}
			this.modules[6][c] = (c % 2 === 0);
		}
	},
	
	setupPositionAdjustPattern : function() {
	
		var pos = QRUtil.getPatternPosition(this.typeNumber);
		
		for (var i = 0; i < pos.length; i++) {
		
			for (var j = 0; j < pos.length; j++) {
			
				var row = pos[i];
				var col = pos[j];
				
				if (this.modules[row][col] !== null) {
					continue;
				}
				
				for (var r = -2; r <= 2; r++) {
				
					for (var c = -2; c <= 2; c++) {
					
						if (Math.abs(r) === 2 || 
                            Math.abs(c) === 2 ||
                            (r === 0 && c === 0) ) {
							this.modules[row + r][col + c] = true;
						} else {
							this.modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	},
	
	setupTypeNumber : function(test) {
	
		var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
	
		for (var i = 0; i < 18; i++) {
			mod = (!test && ( (bits >> i) & 1) === 1);
			this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
		}
	
		for (var x = 0; x < 18; x++) {
			mod = (!test && ( (bits >> x) & 1) === 1);
			this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
		}
	},
	
	setupTypeInfo : function(test, maskPattern) {
	
		var data = (this.errorCorrectLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
	
		// vertical		
		for (var v = 0; v < 15; v++) {
	
			mod = (!test && ( (bits >> v) & 1) === 1);
	
			if (v < 6) {
				this.modules[v][8] = mod;
			} else if (v < 8) {
				this.modules[v + 1][8] = mod;
			} else {
				this.modules[this.moduleCount - 15 + v][8] = mod;
			}
		}
	
		// horizontal
		for (var h = 0; h < 15; h++) {
	
			mod = (!test && ( (bits >> h) & 1) === 1);
			
			if (h < 8) {
				this.modules[8][this.moduleCount - h - 1] = mod;
			} else if (h < 9) {
				this.modules[8][15 - h - 1 + 1] = mod;
			} else {
				this.modules[8][15 - h - 1] = mod;
			}
		}
	
		// fixed module
		this.modules[this.moduleCount - 8][8] = (!test);
	
	},
	
	mapData : function(data, maskPattern) {
		
		var inc = -1;
		var row = this.moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		
		for (var col = this.moduleCount - 1; col > 0; col -= 2) {
	
			if (col === 6) col--;
	
			while (true) {
	
				for (var c = 0; c < 2; c++) {
					
					if (this.modules[row][col - c] === null) {
						
						var dark = false;
	
						if (byteIndex < data.length) {
							dark = ( ( (data[byteIndex] >>> bitIndex) & 1) === 1);
						}
	
						var mask = QRUtil.getMask(maskPattern, row, col - c);
	
						if (mask) {
							dark = !dark;
						}
						
						this.modules[row][col - c] = dark;
						bitIndex--;
	
						if (bitIndex === -1) {
							byteIndex++;
							bitIndex = 7;
						}
					}
				}
								
				row += inc;
	
				if (row < 0 || this.moduleCount <= row) {
					row -= inc;
					inc = -inc;
					break;
				}
			}
		}
		
	}

};

QRCode.PAD0 = 0xEC;
QRCode.PAD1 = 0x11;

QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
	
	var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
	
	var buffer = new QRBitBuffer();
	
	for (var i = 0; i < dataList.length; i++) {
		var data = dataList[i];
		buffer.put(data.mode, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
		data.write(buffer);
	}

	// calc num max data.
	var totalDataCount = 0;
	for (var x = 0; x < rsBlocks.length; x++) {
		totalDataCount += rsBlocks[x].dataCount;
	}

	if (buffer.getLengthInBits() > totalDataCount * 8) {
		throw new Error("code length overflow. (" + 
            buffer.getLengthInBits() + 
            ">" +  
            totalDataCount * 8 + 
            ")");
	}

	// end code
	if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
		buffer.put(0, 4);
	}

	// padding
	while (buffer.getLengthInBits() % 8 !== 0) {
		buffer.putBit(false);
	}

	// padding
	while (true) {
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD0, 8);
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD1, 8);
	}

	return QRCode.createBytes(buffer, rsBlocks);
};

QRCode.createBytes = function(buffer, rsBlocks) {

	var offset = 0;
	
	var maxDcCount = 0;
	var maxEcCount = 0;
	
	var dcdata = new Array(rsBlocks.length);
	var ecdata = new Array(rsBlocks.length);
	
	for (var r = 0; r < rsBlocks.length; r++) {

		var dcCount = rsBlocks[r].dataCount;
		var ecCount = rsBlocks[r].totalCount - dcCount;

		maxDcCount = Math.max(maxDcCount, dcCount);
		maxEcCount = Math.max(maxEcCount, ecCount);
		
		dcdata[r] = new Array(dcCount);
		
		for (var i = 0; i < dcdata[r].length; i++) {
			dcdata[r][i] = 0xff & buffer.buffer[i + offset];
		}
		offset += dcCount;
		
		var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
		var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);

		var modPoly = rawPoly.mod(rsPoly);
		ecdata[r] = new Array(rsPoly.getLength() - 1);
		for (var x = 0; x < ecdata[r].length; x++) {
            var modIndex = x + modPoly.getLength() - ecdata[r].length;
			ecdata[r][x] = (modIndex >= 0)? modPoly.get(modIndex) : 0;
		}

	}
	
	var totalCodeCount = 0;
	for (var y = 0; y < rsBlocks.length; y++) {
		totalCodeCount += rsBlocks[y].totalCount;
	}

	var data = new Array(totalCodeCount);
	var index = 0;

	for (var z = 0; z < maxDcCount; z++) {
		for (var s = 0; s < rsBlocks.length; s++) {
			if (z < dcdata[s].length) {
				data[index++] = dcdata[s][z];
			}
		}
	}

	for (var xx = 0; xx < maxEcCount; xx++) {
		for (var t = 0; t < rsBlocks.length; t++) {
			if (xx < ecdata[t].length) {
				data[index++] = ecdata[t][xx];
			}
		}
	}

	return data;

};

module.exports = QRCode;

}};
var QRCode=R("index"),EC=R("QRErrorCorrectLevel");(typeof window!=="undefined"?window:globalThis).LZL_QR=function(text,ec){var q=new QRCode(-1,EC[ec||"M"]);q.addData(text);q.make();var n=q.getModuleCount(),m=[];for(var r=0;r<n;r++){var row=[];for(var c=0;c<n;c++)row.push(q.isDark(r,c)?1:0);m.push(row);}return m;};})();


/*
 * วิธีใช้: ในแต่ละโปรไฟล์ Chrome (1 โปรไฟล์ = 1 ร้าน) ปักหมุดแท็บ
 *   https://seller.shopee.co.th/portal/sale/returnrefundcancel เปิดค้างไว้
 * แล้วกด ⚡ ร้าน ในแอป Packing Cam (จากเครื่องไหนก็ได้ รวมถึง iPhone) → แท็บของร้านนั้นทำงานเองภายใน ~30 วิ
 *
 * รายรับ (การเงิน): เปิดหน้า การเงิน → รายรับของฉัน (ใส่รหัสผ่านถ้า Shopee ถาม) → สคริปต์ดึงไฟล์ "โอนเงินสำเร็จ"
 *   ตั้งแต่วันที่ดึงล่าสุดถึงวันนี้ (ครั้งแรกย้อนหลัง INCOME_BACKFILL_MONTHS เดือน) แล้วส่งเข้า FIN_ ของ LAZADA X SHOPEE DATA เอง
 */
(function () {
  'use strict';
  // แท็บที่ส่วนเสริม Packing Cam เปิดเบื้องหลัง → ไม่ทำงานซ้ำ (ส่วนเสริมอ่านข้อมูลเอง)
  try { if (/pcext/.test(location.hash)) sessionStorage.setItem('pcext', '1'); if (sessionStorage.getItem('pcext') === '1') return; } catch (e) { }

  const PAGE_RE = /\/portal\/sale\/returnrefundcancel/;
  const DAYS = 30;                       // Shopee ให้ส่งออกได้สูงสุด 30 วัน
  const WAIT_REPORT_SEC = 240;           // รอ Shopee เตรียมไฟล์สูงสุดกี่วินาที
  const POLL_SEC = 10;                   // เช็กคำขอจากแอปทุกกี่วินาที (กด 🔄 ในกระดิ่งแล้วเริ่มดึงภายใน ~10 วิ)
  const AUTO_ON_OPEN = false;            // true = เปิดหน้านี้แล้วดึงเองทันที · false = รอกดปุ่ม ⚡ ในแอปเท่านั้น
  const AUTO_SKIP_HOURS = 2;             // ถ้าดึงสำเร็จไปแล้วภายในกี่ชั่วโมง ไม่ดึงซ้ำตอนเปิดหน้า (กันรีเฟรชแล้วดึงซ้ำ)
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const onPage = () => PAGE_RE.test(location.pathname);
  const INCOME_RE = /\/portal\/finance\/income/;
  const onIncome = () => INCOME_RE.test(location.pathname);
  const INCOME_BACKFILL_MONTHS = 12;     // ครั้งแรกของแต่ละร้าน: ดึงย้อนหลังกี่เดือน (ไฟล์ละ 1 เดือน)
  const INCOME_OVERLAP_DAYS = 3;         // ดึงทับวันเดิมกี่วัน (กันรายการที่โอนช้า · ระบบแทนที่ข้อมูลช่วงซ้ำให้เอง ไม่ซ้ำ)
  const INCOME_SKIP_HOURS = 3;           // เปิดหน้าซ้ำภายในกี่ชั่วโมงหลังดึงสำเร็จ ไม่ดึงอีก
  const ORDER_OVERLAP_DAYS = 45;         // คำสั่งซื้อ: ดึงทับย้อนหลังกี่วัน (สถานะยกเลิก/คืนยังเปลี่ยนได้)
  const INCOME_WAIT_MIN = 40;            // รอ Shopee เตรียมไฟล์รายรับสูงสุดกี่นาที (ปกติ 3–8 นาที)
  const TOSHIP_BACK_DAYS = 7;            // 🚚 ที่ต้องจัดส่ง: ดึงออเดอร์ที่สั่งย้อนหลังกี่วัน · 7 วัน = รวมออเดอร์ "จัดส่งช้า" ที่ค้างจากหลายวันก่อน (นับเฉพาะสถานะที่ต้องจัดส่ง)
  const TOSHIP_HOURS = [8, 14];          // ดึงเองทุกชั่วโมงช่วง 8:00–14:59 (นอกช่วงนี้ดึงเมื่อกด 🔄 ในกระดิ่งของแอปเท่านั้น)

  /* ---------------- ตั้งค่า (ลิงก์ /exec + รหัส เหมือนในแอป Packing Cam) ---------------- */
  function normalizeApiUrl(u) {
    u = String(u || '').trim().replace(/[\s​-‍﻿]+/g, '');
    const a = u.match(/\/a\/macros\/([^/]+)\/s\/([A-Za-z0-9_-]{20,})/);
    if (a) return 'https://script.google.com/a/macros/' + a[1] + '/s/' + a[2] + '/exec';
    const m = u.match(/\/macros\/(?:u\/\d+\/)?s\/([A-Za-z0-9_-]{20,})/);
    return m ? 'https://script.google.com/macros/s/' + m[1] + '/exec' : u;
  }
  function settings(force) {
    let url = GM_getValue('apiUrl', ''), token = GM_getValue('apiToken', '');
    if (force || !url || !token) {
      const u = prompt('ลิงก์ Web app ของ Packing Cam (ลงท้ายด้วย /exec)', url); if (u === null) return null;
      const t = prompt('รหัส API_TOKEN (เหมือนที่กรอกในแอป)', token); if (t === null) return null;
      url = normalizeApiUrl(u); token = t.trim();
      GM_setValue('apiUrl', url); GM_setValue('apiToken', token);
    }
    return { url, token };
  }
  GM_registerMenuCommand('⚙️ ตั้งค่าลิงก์/รหัส Packing Cam', () => settings(true));
  GM_registerMenuCommand('💰 ดึงรายรับใหม่ตั้งแต่ต้น (ย้อนหลัง ' + INCOME_BACKFILL_MONTHS + ' เดือน)', () => {
    if (!myShop) return alert('เปิดหน้า "รายรับของฉัน" ก่อน แล้วลองใหม่');
    const k = myShop.toLowerCase();
    loadShared().then(() => Promise.all([sset('incTo_' + k, ''), sset('ordTo_' + k, ''), sset('incOk_' + k, 0)])).then(() => alert('ล้างแล้ว (ทุกเครื่อง) – รีเฟรชหน้ารายรับของฉัน'));
  });
  GM_registerMenuCommand('🏪 ล้างการจับคู่ชื่อร้าน', () => { loadShared().then(() => sset('shopMap', '{}')).then(() => { myShop = ''; alert('ล้างแล้ว (ทุกเครื่อง) – รีเฟรชหน้า'); }); });

  /* ---------------- เรียก Packing Cam (ข้าม CSP ของหน้า Shopee ด้วย GM_xmlhttpRequest) ---------------- */
  function api(action, payload, quiet) {
    const cfg = quiet ? { url: GM_getValue('apiUrl', ''), token: GM_getValue('apiToken', '') } : settings(false);
    if (!cfg || !cfg.url) return Promise.reject(new Error('ยังไม่ได้ตั้งค่าลิงก์/รหัส'));
    const body = JSON.stringify(Object.assign({ token: cfg.token, action }, payload));
    const once = () => new Promise((res, rej) => {
      GM_xmlhttpRequest({
        method: 'POST', url: cfg.url, timeout: 180000,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        data: body,
        onload: r => {
          let j; try { j = JSON.parse(r.responseText); } catch (e) {
            const t = String(r.responseText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
            const err = new Error('Packing Cam ตอบผิดรูปแบบ (HTTP ' + r.status + ')' + (t ? ': ' + t : '')); err.retry = r.status >= 500 || r.status === 429; return rej(err);
          }
          j.ok ? res(j) : rej(new Error(j.error || 'ไม่สำเร็จ'));
        },
        onerror: r => { const e = new Error('เชื่อมต่อ Packing Cam ไม่ได้' + (r && (r.error || r.status) ? ' (' + (r.error || 'HTTP ' + r.status) + ')' : '') +
          ' – เช็กว่า Tampermonkey อนุญาตให้เชื่อมต่อ script.google.com แล้ว'); e.retry = true; rej(e); },
        ontimeout: () => { const e = new Error('Packing Cam ตอบช้าเกินไป'); e.retry = true; rej(e); }
      });
    });
    return (async () => {                                       // ลองใหม่สูงสุด 3 ครั้ง (เน็ต/Google สะดุดชั่วคราว)
      for (let a = 1; ; a++) {
        try { return await once(); }
        catch (e) { if (!e.retry || a >= 3) throw e; console.warn('[Packing Cam] ลองใหม่ ' + a, e.message); await sleep(4000 * a); }
      }
    })();
  }

  /* ---------------- 🔄 สถานะกลาง: ความคืบหน้าเก็บที่ Packing Cam → ทุกเครื่องเห็นตรงกัน ----------------
   * ค่าที่ใช้ร่วมกัน: incTo_/ordTo_/incOk_/lastOk_<ร้าน>, lnwTo, lnwOk, lzPdfOk, shopMap
   * ลิงก์/รหัส Packing Cam ยังเก็บในเครื่อง (กรอกครั้งแรกครั้งเดียวต่อเครื่อง)
   */
  const SHARED_RE = /^(incTo_|ordTo_|incOk_|lastOk_|lnwTo$|lnwOk$|lzPdfOk$|shopMap$)/;
  let shared = null;                                           // null = ใช้ค่าในเครื่อง (Packing Cam ยังไม่อัปเดต/ต่อไม่ได้)
  const MID = GM_getValue('machineId', '') || (() => { const v = Math.random().toString(36).slice(2, 10); GM_setValue('machineId', v); return v; })();
  const HOST = (navigator.userAgentData && navigator.userAgentData.platform || navigator.platform || 'คอม') + '-' + MID.slice(0, 4);
  async function loadShared() {
    try {
      const r = await api('tmGet', {}, true);
      if (!r.state || typeof r.state !== 'object') throw new Error('Packing Cam ยังไม่รองรับ');
      shared = r.state;
      if (!GM_getValue('sharedMigrated', 0)) {                 // ครั้งแรกของเครื่องนี้: ส่งความคืบหน้าเดิมในเครื่องขึ้นไปรวม
        const up = {};
        GM_listValues().filter(k => SHARED_RE.test(k)).forEach(k => {
          const v = GM_getValue(k), cur = shared[k];
          if (k === 'shopMap') { const m = Object.assign(JSON.parse(v || '{}'), JSON.parse(cur || '{}')); up[k] = JSON.stringify(m); }
          else if (v && (cur == null || cur === '' || (typeof v === 'number' ? v > +cur : String(v) > String(cur)))) up[k] = v;
        });
        if (Object.keys(up).length) shared = (await api('tmSet', { values: up }, true)).state || Object.assign(shared, up);
        GM_setValue('sharedMigrated', 1);
      }
    } catch (e) { console.warn('[Packing Cam] ใช้ค่าในเครื่องแทนสถานะกลาง:', e.message); shared = null; }
    return shared;
  }
  const sget = (k, def) => shared ? (shared[k] == null ? def : shared[k]) : GM_getValue(k, def);
  async function sset(k, v) {
    GM_setValue(k, v);
    if (!shared) return;
    shared[k] = v;
    try { await api('tmSet', { values: { [k]: v } }, true); } catch (e) { console.warn('[Packing Cam] บันทึกสถานะกลางไม่ได้', e.message); }
  }
  /** ทำงาน name ได้ทีละเครื่อง · เครื่องอื่นกำลังทำอยู่ → คืนค่า false (ข้ามรอบนี้) · ต่ออายุทุก 3 นาทีระหว่างทำงาน */
  async function withLock(name, st, fn) {
    let r;
    try { r = await api('tmLock', { name, owner: MID, host: HOST, ttlMin: 10 }, true); } catch (e) { r = { got: true, off: true }; }   // Packing Cam เก่า → ทำงานแบบเดิม
    if (r.got === false) {
      st('⏸️ เครื่องอื่น (' + (r.host || '?') + ') กำลังดึงอยู่ ตั้งแต่ ' + new Date(r.since).toTimeString().slice(0, 5) + ' – เครื่องนี้ข้ามรอบนี้');
      return false;
    }
    const hb = r.off ? 0 : setInterval(() => api('tmLock', { name, owner: MID, host: HOST, ttlMin: 10 }, true).catch(() => {}), 180000);
    try { await loadShared(); return await fn(); }            // อ่านความคืบหน้าล่าสุดหลังได้สิทธิ์ (เผื่อเครื่องอื่นเพิ่งทำเสร็จ)
    finally { if (hb) clearInterval(hb); if (!r.off) api('tmUnlock', { name, owner: MID }, true).catch(() => {}); }
  }

  /* ---------------- API ของ Seller Centre (ใช้การล็อกอินของคุณเอง) ---------------- */
  async function reportList() {
    const r = await fetch('/api/v3/settings/get_report_list/?parent_type=ps_reports_order&page_number=1&page_size=20&status=1,2,3',
      { credentials: 'include' }).then(r => r.json());
    return (r.data && r.data.list) || [];
  }
  async function downloadReport(id) {
    const r = await fetch('/api/v3/settings/download_report/?report_id=' + id, { credentials: 'include' });
    if (!r.ok) throw new Error('ดาวน์โหลดรายงานไม่ได้ (HTTP ' + r.status + ')');
    return r.blob();
  }
  function blobToBase64(b) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(b); });
  }

  /** ชื่อบัญชีที่ล็อกอินอยู่ (เช็กก่อนทำงานทุกครั้ง) */
  async function getAccount() {
    const find = (o, d) => {
      if (!o || typeof o !== 'object' || d > 4) return '';
      for (const k of Object.keys(o)) if (/^(username|user_name)$/i.test(k) && typeof o[k] === 'string' && o[k]) return o[k];
      for (const k of Object.keys(o)) { const v = find(o[k], d + 1); if (v) return v; }
      return '';
    };
    try { const j = await fetch('/api/v2/login/', { credentials: 'include' }).then(r => r.json()); const u = find(j, 0); if (u) return u; } catch (e) {}
    try { const l = await reportList(); if (l[0] && l[0].user_name) return l[0].user_name; } catch (e) {}
    const el = [...document.querySelectorAll('header *, [class*=account] *, [class*=user] *')]
      .find(e => !e.children.length && /^[a-z0-9._]{3,30}$/i.test(e.textContent.trim()));
    return el ? el.textContent.trim() : '';
  }

  /* ---------------- เลือกร้าน (ชื่อบัญชี Shopee ↔ โฟลเดอร์ร้านใน Drive) ---------------- */
  async function shopOf(account, askIfUnknown) {
    if (!shared) await loadShared();
    const map = JSON.parse(sget('shopMap', '{}') || '{}');
    if (map[account]) return map[account];
    const shops = ((await api('shopeeShops', {}, !askIfUnknown)).shops || []).map(s => s.name);
    let shop = shops.find(s => s.toLowerCase() === String(account).toLowerCase());
    if (!shop) {
      if (!askIfUnknown) return '';
      const ans = prompt('บัญชี "' + account + '" คือร้านไหน? พิมพ์ชื่อให้ตรงกับรายการ:\n' + shops.join(' / '), shops[0] || '');
      if (!ans || shops.indexOf(ans.trim()) < 0) throw new Error('ไม่ได้เลือกร้าน');
      shop = ans.trim();
    }
    map[account] = shop; await sset('shopMap', JSON.stringify(map));
    return shop;
  }

  /* ---------------- ทำงานกับหน้าเว็บ ---------------- */
  const vis = e => e && e.offsetParent !== null;
  const dateGroup = () => [...document.querySelectorAll('.advance-filter-input-group')].find(x => /วันที่ยื่นคำขอ/.test(x.innerText));

  async function setDateRange() {
    if (!dateGroup()) {                                         // ตัวกรองถูกย่ออยู่ → กดขยาย
      const ex = document.querySelector('[data-testid="advance-filter-button-expand"]');
      if (ex) { ex.click(); await sleep(800); }
    }
    const g = dateGroup(); if (!g) throw new Error('ไม่พบช่อง "วันที่ยื่นคำขอ"');
    const dp = g.querySelector('.eds-date-picker');
    let panel = [...document.querySelectorAll('.eds-daterange-picker-panel')].find(vis);
    if (!panel) { dp.querySelector('.eds-selector').click(); await sleep(600); panel = [...document.querySelectorAll('.eds-daterange-picker-panel')].find(vis); }
    if (!panel) throw new Error('เปิดปฏิทินไม่ได้');

    const side = n => panel.querySelector('.eds-daterange-picker-panel__body-' + n);
    const hdr = s => { const l = [...s.querySelectorAll('.eds-picker-header__label')].map(x => x.textContent.trim()); return { m: MON.indexOf(l[0]), y: +l[1] }; };
    const goto = async (s, d) => {
      for (let i = 0; i < 24; i++) {
        const h = hdr(s), diff = (h.y - d.getFullYear()) * 12 + (h.m - d.getMonth());
        if (!diff) return;
        const ic = s.querySelectorAll(diff > 0 ? '.eds-picker-header__prev' : '.eds-picker-header__next');
        (ic[1] || ic[0]).click(); await sleep(200);           // ลูกศรตัวที่ 2 = เลื่อนทีละเดือน
      }
      throw new Error('เลื่อนเดือนในปฏิทินไม่ได้');
    };
    const clickDay = (s, d) => {
      const c = [...s.querySelectorAll('.eds-date-table__rows .eds-date-table__cell')]
        .find(c => /\bnormal\b/.test(c.className) && !c.className.split(/\s+/).includes('disabled') && c.textContent.trim() === String(d));
      if (!c) throw new Error('คลิกวันที่ ' + d + ' ไม่ได้');
      c.click();
    };

    const end = new Date(), start = new Date(end.getTime() - (DAYS - 1) * 864e5);
    await goto(side('left'), start);
    clickDay(side('left'), start.getDate()); await sleep(250);
    const L = hdr(side('left'));
    const s = (L.m === end.getMonth() && L.y === end.getFullYear()) ? side('left') : side('right');
    await goto(s, end);
    clickDay(s, end.getDate()); await sleep(600);
    const shown = dp.querySelector('.eds-selector__inner').textContent.trim();
    if (!/\d{2}\/\d{2}\/\d{4}/.test(shown)) throw new Error('ตั้งวันที่ไม่สำเร็จ');

    const ok = [...document.querySelectorAll('.advance-filter-button button')].find(b => b.innerText.trim() === 'ยืนยัน');
    if (ok) { ok.click(); await sleep(2500); }                  // ใช้ตัวกรองวันที่
    return shown;
  }

  async function clickExport() {
    const btn = document.querySelector('.shopee-export-button button.export');
    if (!btn) throw new Error('ไม่พบปุ่ม Export');
    btn.click();
    await sleep(1500);
    const modal = [...document.querySelectorAll('.eds-modal, .eds-modal__box, [role="dialog"]')].find(vis);   // มีหน้าต่างยืนยัน → กดยืนยัน
    if (modal) {
      const b = [...modal.querySelectorAll('button')].reverse().find(b => /export|ยืนยัน|confirm|ตกลง|ส่งออก/i.test(b.innerText));
      if (b) { b.click(); await sleep(1500); }
    }
  }

  /* ---------------- งานหลัก ---------------- */
  let running = false, myShop = '', myAccount = '';

  /**
   * want = ร้านที่ต้องการ (จากคำขอ/ลิงก์) · '' = ร้านของแท็บนี้
   * เช็กบัญชีก่อนเริ่ม: ถ้าไม่ใช่ร้านที่ต้องการ → ส่งคำขอต่อให้แท็บของร้านนั้นแทน (ไม่ Export ผิดร้าน)
   */
  /* ⚡ อ่านรายการคืนสินค้า/ส่งไม่สำเร็จจากหน้าเว็บตรง (ไม่ต้องรอ Shopee สร้างไฟล์) · ไม่ส่งข้อมูลผู้ซื้อ */
  const RT_BACK_DAYS = 45;               // คืนสินค้า: ดูคำขอที่ยื่นในกี่วันล่าสุด (ไฟล์รายงานเดิมได้ 30 วัน)
  const RT_FAIL_DAYS = 60;               // ส่งไม่สำเร็จ: ดูออเดอร์ที่สั่งในกี่วันล่าสุด
  async function rtList() {
    const go = (cs, page) => fetch('/api/v4/seller_center/return/return_list/get_exceptional_case_list?SPC_CDS=' + cookie('SPC_CDS') + '&SPC_CDS_VER=2', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'th', is_reverse_sorting_order: false, page_number: page, page_size: 40, keyword: null, pending_action: null, request_solution: null,
        forward_logistics_statuses: [], reverse_logistics_statuses: [], return_reasons: [], create_time_range: { lower_value: null, upper_value: null },
        compensation_amount_option: null, advanced_fulfilment_option: null, seller_request_statuses: [], validation_type_option: null, request_adjusted: null,
        refund_amount_range: { lower_value: null, upper_value: null }, invoice_statuses: null, fulfilled_by_shopee_option: null,
        flow_tab: 1, case_tab: cs, sorting_field: 1, key_action_due_time_range: { lower_value: null, upper_value: null }, platform_type: 'sc' })
    }).then(r => r.json());
    const p2 = n => String(n).padStart(2, '0');
    const fmt = t => { t = +t; if (!t) return ''; const d = new Date(t * 1000); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); };
    const snDate = sn => { const m = String(sn || '').match(/^(\d{2})(\d{2})(\d{2})/); return m ? '20' + m[1] + '-' + m[2] + '-' + m[3] : ''; };
    const cutOf = days => { const d = new Date(Date.now() - days * 864e5); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
    const out = [];
    for (const [cs, src, days] of [[1, 'R', RT_BACK_DAYS], [3, 'F', RT_FAIL_DAYS]]) {   // case_tab 1 = คืนเงิน/คืนสินค้า · 3 = จัดส่งไม่สำเร็จ
      const cut = cutOf(days);
      for (let page = 1; page <= 25; page++) {
        const r = await go(cs, page);
        if (!r || !r.data || (r.code != null && r.code !== 0) || (r.error != null && r.error !== 0 && r.error !== '')) throw new Error('อ่านรายการคืนสินค้าไม่ได้ (' + ((r && (r.user_message || r.message || r.msg)) || 'ไม่มีข้อมูล') + ')');
        const L = r.data.exceptional_case_list || [];
        L.forEach(c => {
          const date = snDate(src === 'R' ? c.return_sn : c.order_sn); if (!date || date < cut) return;
          const fw = c.forward_logistics_info || {}, rv = c.reverse_logistics_info || {};
          const attr = {}; ((c.header && c.header.attribute_list && c.header.attribute_list.return_attributes) || []).forEach(a => { attr[a.key] = a.value; });
          const rvT = (rv.tracking_numbers || []).filter(Boolean)[0] || '', fwT = (fw.tracking_numbers || []).filter(Boolean)[0] || '';
          const rvS = rv.aggregated_logistics_status_text && rv.aggregated_logistics_status_text !== 'ไม่มี' ? rv.aggregated_logistics_status_text : '';
          (c.product_items || []).forEach(it => {
            const pr = it.product || {}, md = it.model || {};
            out.push({ src, order: c.order_sn || '', req: src === 'R' ? (c.return_sn || '') : '',
              type: src === 'R' ? (c.request_solution_text || '') : 'ส่งไม่สำเร็จ (ตีกลับ)', st: (c.header && c.header.status_text) || '',
              ship: src === 'R' ? rvS : (rvS || fw.aggregated_logistics_status_text || ''),
              sku: md.sku || pr.sku || '', psku: pr.sku || '', name: String(pr.name || '').slice(0, 120), model: String(md.name || '').slice(0, 80),
              qty: String(it.returned_amount || it.amount || ''), amt: src === 'R' ? String(c.display_refund_amount || '').replace(/[^\d.]/g, '') : '',
              reason: src === 'R' ? (c.request_reason_text || '') : '', date,
              track: src === 'R' ? rvT : (fwT || rvT), trackOut: src === 'R' ? fwT : '',
              backAt: /^จัดส่งสำเร็จ|คืนผู้ขายแล้ว/.test(rvS) ? fmt(rv.latest_logistics_status_update_time) : '',
              deadline: fmt(attr.return_seller_due_date) });
          });
        });
        if (!(r.data.pagination_info && r.data.pagination_info.has_more) || !L.length) break;
        await sleep(200);
      }
    }
    return out;
  }
  async function run(want, source) {
    if (running) return; running = true;
    const st = msg => { label.textContent = msg; };
    btn.disabled = true;
    let shop = '';
    try {
      if (!settings(false)) throw new Error('ยังไม่ได้ตั้งค่า');
      st('⏳ ตรวจบัญชีที่ล็อกอิน…');
      myAccount = await getAccount();
      if (!myAccount) throw new Error('อ่านชื่อบัญชีไม่ได้ – ล็อกอิน Seller Centre ก่อน');
      shop = myShop = await shopOf(myAccount, true);

      if (want && want.toLowerCase() !== shop.toLowerCase()) {
        await api('shopeeRequest', { shop: want });
        st('↪️ แท็บนี้คือร้าน ' + shop + ' – ส่งคำขอต่อให้แท็บของร้าน ' + want + ' แล้ว (ไม่ได้ Export ที่นี่)');
        shop = '';                                             // ไม่รายงานสถานะทับของร้านอื่น
        return;
      }
      if (source !== 'queue') api('shopeeState', { shop, state: 'running' }, true).catch(() => {});

      // ⚡ อ่านจากหน้าเว็บก่อน (ไม่กี่วินาที) · อ่านไม่ได้ → ใช้ไฟล์รายงานแบบเดิม
      try {
        st('⚡ [' + shop + '] อ่านรายการคืนสินค้า/ส่งไม่สำเร็จ…');
        const t0 = Date.now(), list = await rtList();
        const res = await api('shopeeReturnsList', { shop, list });
        if (!res || res.error || res.busy || res.skipped) throw new Error((res && (res.error || res.skipped)) || 'LAZADA X SHOPEE DATA กำลังทำงานอื่นอยู่');
        const t = new Date().toTimeString().slice(0, 5), msg = 'อ่านจากหน้าเว็บ ' + list.length + ' รายการ (ใหม่ ' + (res.fresh || 0) + ') เวลา ' + t;
        await sset('lastOk_' + shop.toLowerCase(), Date.now());
        await api('shopeeState', { shop, state: 'done', msg }, true).catch(() => {});
        st('✅ [' + shop + '] ' + msg + ' · ' + Math.round((Date.now() - t0) / 1000) + ' วิ');
        return;
      } catch (e) {
        console.warn('[Packing Cam ⚡ คืนสินค้า]', e);
        if (source === 'auto') throw new Error('อ่านรายการคืนสินค้าไม่ได้ (' + e.message + ') – รอบอัตโนมัติไม่ดึงไฟล์รายงาน กด ⚡ ในแอปเพื่อใช้ไฟล์รายงาน');
        st('⚠️ [' + shop + '] อ่านจากหน้าเว็บไม่ได้ (' + e.message + ') – ใช้ไฟล์รายงานแทน'); await sleep(1500);
      }

      st('⏳ [' + shop + '] ตรวจรายงานเดิม…');
      const before = new Set((await reportList()).map(r => r.report_id));
      st('⏳ [' + shop + '] ตั้งวันที่ย้อน ' + DAYS + ' วัน…');
      const range = await setDateRange();
      st('⏳ [' + shop + '] กด Export (' + range + ')…');
      await clickExport();

      let fresh = [], t0 = Date.now();
      while (Date.now() - t0 < WAIT_REPORT_SEC * 1000) {
        await sleep(4000);
        const list = (await reportList()).filter(r => !before.has(r.report_id));
        if (list.length && list.every(r => r.status !== 1)) { fresh = list.filter(r => r.status === 2); break; }
        st('⏳ [' + shop + '] Shopee กำลังเตรียมไฟล์… ' + Math.round((Date.now() - t0) / 1000) + ' วิ');
      }
      if (!fresh.length) throw new Error('ไม่พบไฟล์ใหม่ภายใน ' + WAIT_REPORT_SEC + ' วินาที – ลองใหม่อีกครั้ง');

      let n = 0, imp = null;
      for (let i = 0; i < fresh.length; i++) {
        const r = fresh[i];
        st('⬆️ [' + shop + '] ส่ง ' + r.report_file_name + ' และนำเข้า…');
        const res = await api('shopeeUpload', {
          shop, name: r.report_file_name, data: await blobToBase64(await downloadReport(r.report_id)),
          importNow: i === fresh.length - 1                    // สั่งนำเข้าครั้งเดียวหลังไฟล์สุดท้าย
        });
        if (res.imported) imp = res.imported;
        n++;
      }
      const t = new Date().toTimeString().slice(0, 5);
      const impTxt = !imp ? '' : imp.error ? ' • นำเข้าไม่สำเร็จ: ' + imp.error
        : imp.skipped ? ' • นำเข้าภายใน ~10 นาที'
        : ' • นำเข้าแล้ว (ใหม่ ' + (imp.fresh || 0) + ' รายการ)';
      await sset('lastOk_' + shop.toLowerCase(), Date.now());
      await api('shopeeState', { shop, state: 'done', msg: 'ส่ง ' + n + ' ไฟล์ เวลา ' + t + impTxt }, true).catch(() => {});
      st('✅ [' + shop + '] ส่ง ' + n + ' ไฟล์ เวลา ' + t + impTxt);
    } catch (e) {
      st('❌ ' + e.message);
      console.warn('[Packing Cam]', e);
      if (shop) api('shopeeState', { shop, state: 'error', msg: e.message }, true).catch(() => {});
    } finally {
      running = false; btn.disabled = false;
    }
  }


  /* ================= 💰 รายรับของฉัน → FIN_ ================= */
  const INC = '/api/v4/accounting/pc/seller_income/income_report/';
  const cookie = n => (document.cookie.match('(^|; )' + n + '=([^;]*)') || [])[2] || '';
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };

  async function incJson(path, opt) {
    const r = await fetch(INC + path + (path.includes('?') ? '&' : '?') + 'SPC_CDS=' + cookie('SPC_CDS') + '&SPC_CDS_VER=2',
      Object.assign({ credentials: 'include' }, opt || {}));
    const j = await r.json().catch(() => ({}));
    if (j.code !== 0) throw new Error('Shopee: ' + (j.user_message || j.message || 'HTTP ' + r.status));
    return j.data || {};
  }
  /** หน้าการเงินพร้อมใช้ (ใส่รหัสผ่านแล้ว) */
  async function incReady() {
    try { await incJson('get_income_report_list?parent_type=ps_reports_income&page_number=1&page_size=1&status=1,2&income_category=2'); return true; }
    catch (e) { return false; }
  }
  /** ช่วงที่ต้องดึง: ไฟล์ละไม่เกิน 1 เดือนปฏิทิน */
  function incChunks(from, to) {
    const out = [];
    let s = from;
    while (s <= to) {
      const d = new Date(s + 'T12:00:00');
      const monthEnd = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      const e = monthEnd < to ? monthEnd : to;
      out.push([s, e]); s = addDays(e, 1);
    }
    return out;
  }
  /** สั่งให้ Shopee เตรียมไฟล์ (ยังไม่รอ) */
  async function incRequest(from, to) {
    const g = await incJson('request_income_report_generation', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ start_date: from, end_date: to, income_category: 2 })   // 2 = โอนเงินสำเร็จแล้ว
    });
    if (!g.report_id) throw new Error('Shopee ไม่ได้สร้างรายงาน ' + from + ' → ' + to);
    return { id: g.report_id, name: g.file_name, from, to, t0: Date.now() };
  }
  /** รอไฟล์พร้อม แล้วดาวน์โหลด */
  async function incFetch(job, st) {
    for (;;) {
      const r = await incJson('get_income_report?report_id=' + job.id);
      if (r.status === 2 || r.status === 3) break;
      if (r.status !== 1) throw new Error('Shopee เตรียมไฟล์ไม่สำเร็จ (สถานะ ' + r.status + ')');
      if (Date.now() - job.t0 > INCOME_WAIT_MIN * 60e3) throw new Error('Shopee เตรียมไฟล์นานเกิน ' + INCOME_WAIT_MIN + ' นาที – เปิดหน้านี้ใหม่ภายหลัง (ทำต่อจากเดิม)');
      st('⏳ Shopee กำลังเตรียมไฟล์ ' + job.from + ' → ' + job.to + '… ' + Math.round((Date.now() - job.t0) / 60000) + ' นาที (ปกติ 3–8 นาที)');
      await sleep(10000);
    }
    const res = await fetch(INC + 'download_income_report?report_id=' + job.id + '&SPC_CDS=' + cookie('SPC_CDS') + '&SPC_CDS_VER=2', { credentials: 'include' });
    if (!res.ok) throw new Error('ดาวน์โหลดไฟล์รายรับไม่ได้ (HTTP ' + res.status + ')');
    const blob = await res.blob();
    if (blob.size < 500) throw new Error('ไฟล์รายรับที่ได้ไม่ถูกต้อง');
    return { name: job.name || ('Income.โอนเงินสำเร็จ.th.' + job.from.replace(/-/g, '') + '_' + job.to.replace(/-/g, '') + '.xlsx'), blob };
  }


  /* ================= 🧾 คำสั่งซื้อทั้งหมด (Order.all) → FIN_ShopeeItems / SALES_ ================= */
  const cds = () => '&SPC_CDS=' + cookie('SPC_CDS') + '&SPC_CDS_VER=2';
  async function ordRequest(from, to) {
    const j = await fetch('/api/v3/order/request_order_report?start_date=' + from + '&end_date=' + to +
      '&language=th&screening_condition=order_creation_date&parcel_level_filter=0' + cds(), { credentials: 'include' }).then(r => r.json()).catch(() => ({}));
    if (j.code !== 0 || !j.data || !j.data.report_id) throw new Error('Shopee ไม่รับคำขอไฟล์คำสั่งซื้อ ' + from + ' → ' + to + ': ' + (j.user_message || j.message || ''));
    return { id: j.data.report_id, name: j.data.report_file_name, from, to, n: j.data.record_numbers, t0: Date.now() };
  }
  async function ordFetch(job, st) {
    for (;;) {
      const g = await fetch('/api/v3/settings/get_report/?report_id=' + job.id + cds(), { credentials: 'include' }).then(r => r.json()).catch(() => ({}));
      const s = g.data && g.data.status;
      if (s === 2 || s === 3) { job.name = g.data.report_file_name || job.name; break; }
      if (g.code === 0 && s !== 1) throw new Error('Shopee เตรียมไฟล์คำสั่งซื้อไม่สำเร็จ (สถานะ ' + s + ')');
      if (Date.now() - job.t0 > 15 * 60e3) throw new Error('Shopee เตรียมไฟล์คำสั่งซื้อนานเกิน 15 นาที');
      st('⏳ เตรียมไฟล์คำสั่งซื้อ ' + job.from + ' → ' + job.to + '…');
      await sleep(4000);
    }
    const res = await fetch('/api/v3/settings/download_report/?report_id=' + job.id + cds(), { credentials: 'include' });
    if (!res.ok) throw new Error('ดาวน์โหลดไฟล์คำสั่งซื้อไม่ได้ (HTTP ' + res.status + ')');
    const blob = await res.blob();
    if (blob.size < 500) {
      const txt = (await blob.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 150);
      throw new Error('ไฟล์คำสั่งซื้อที่ได้ไม่ถูกต้อง (' + blob.size + ' ไบต์' + (txt ? ': ' + txt : '') + ')');
    }
    return { name: job.name || ('Order.all.' + job.from.replace(/-/g, '') + '_' + job.to.replace(/-/g, '') + '.xlsx'), blob };
  }
  /** ดึง Order.all ทีละเดือน: ครั้งแรกย้อนหลัง INCOME_BACKFILL_MONTHS เดือน · ครั้งต่อไปทับย้อนหลัง ORDER_OVERLAP_DAYS วัน */
  async function syncOrders(shop, k, st) {
    const today = ymd(new Date()), lastTo = sget('ordTo_' + k, '');
    let from;
    if (lastTo) from = addDays(lastTo, -ORDER_OVERLAP_DAYS);
    else { const d = new Date(); d.setMonth(d.getMonth() - INCOME_BACKFILL_MONTHS + 1, 1); from = ymd(d); }
    const chunks = incChunks(from, today);
    let n = 0, firstFail = '';
    const fails = [];
    for (const [a, b] of chunks) {                             // เดือนไหนพัง → ข้ามไปเดือนถัดไป แล้วรอบหน้าทำเดือนที่พังใหม่
      try {
        st('[' + shop + '] 🧾 คำสั่งซื้อ (' + (n + fails.length + 1) + '/' + chunks.length + ') ' + a + ' → ' + b + '…');
        let job;
        try { job = await ordRequest(a, b); }
        catch (e) { st('[' + shop + '] 🧾 Shopee ให้รอ 1 นาที…'); await sleep(65000); job = await ordRequest(a, b); }   // Shopee จำกัดความถี่ → รอแล้วลองใหม่ 1 ครั้ง
        if (job.n !== 0) {
          const f = await ordFetch(job, m => st('[' + shop + '] 🧾 ' + m));
          st('[' + shop + '] 🧾 ส่ง ' + f.name + '…');
          await api('shopeeUpload', { shop, name: f.name, data: await blobToBase64(f.blob), importNow: false });
        }
        n++;
      } catch (e) {
        console.warn('[Packing Cam คำสั่งซื้อ] ' + a + ' → ' + b, e);
        fails.push(a.slice(0, 7) + ': ' + e.message);
        if (!firstFail) firstFail = a;
      }
      if (!firstFail) await sset('ordTo_' + k, b < today ? b : today);   // บันทึกความคืบหน้าถึงก่อนเดือนที่พัง
      await sleep(3000);
    }
    if (fails.length) throw new Error('สำเร็จ ' + n + ' เดือน · ไม่สำเร็จ ' + fails.length + ' เดือน (รอบหน้าลองใหม่) – ' + fails[0]);
    return n;
  }


  /** เทียบเวอร์ชัน 3.10 > 3.9 */
  function verNewer(a, b) {
    const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
    return false;
  }

  /* ================= 🚚 ที่ต้องจัดส่ง (คำสั่งซื้อเมื่อวาน–วันนี้) → ShopeeToShip (กระดิ่งในแอป Packing Cam) ================= */
  let tsRunning = false;
  /** ⚡ อ่าน "ที่ต้องจัดส่ง" ตรงจากรายการที่หน้า Seller Centre ใช้เอง (~2 วิ) · อ่านอย่างเดียว · ไม่ส่งข้อมูลผู้ซื้อ/ที่อยู่ */
  async function tsList() {
    const post = (p, b) => fetch('/api/v3/order/' + p + '?SPC_CDS=' + cookie('SPC_CDS') + '&SPC_CDS_VER=2', { method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    const index = async status => {            // 1 = ยังไม่ดำเนินการ · 2 = ดำเนินการแล้ว
      let all = [], tot = 0;
      for (let page = 1; page <= 25; page++) {
        const r = await post('search_order_list_index', { order_list_tab: 300, entity_type: 1, pagination: { page_number: page, page_size: 40 },
          filter: { order_to_ship_status: status, fulfillment_type: 0, is_drop_off: 0, action_filter: 0, fulfillment_source: 0 }, sort: { sort_type: 2, ascending: true } });
        if (!r || r.code !== 0 || !r.data) throw new Error('อ่านรายการไม่ได้ (' + ((r && (r.user_message || r.message)) || 'ไม่มีข้อมูล') + ')');
        const L = r.data.index_list || []; tot = (r.data.pagination && r.data.pagination.total) || 0; all = all.concat(L);
        if (all.length >= tot || !L.length) break;
      }
      return all;
    };
    const fmt = t => { if (!t) return ''; const d = new Date(t * 1000), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
    const rows = [];
    for (const status of [2, 1]) {
      const list = await index(status);
      for (let i = 0; i < list.length; i += 5) {          // Shopee ให้ขอรายละเอียดได้ครั้งละ 5 กล่อง (เท่ากับหน้าเว็บ)
        const r = await post('get_order_list_card_list', { order_list_tab: 300, need_count_down_desc: false,
          package_param_list: list.slice(i, i + 5).map(x => ({ package_number: x.package_number, shop_id: x.shop_id, region_id: x.region_id })) });
        if (!r || r.code !== 0 || !r.data) throw new Error('อ่านรายละเอียดไม่ได้ (' + ((r && (r.user_message || r.message)) || 'ไม่มีข้อมูล') + ')');
        (r.data.card_list || []).forEach(c => {
          const p = c.package_card || {}, f = p.fulfilment_info || {}, o = p.order_ext_info || {};
          const items = [];
          ((p.item_info_group && p.item_info_group.item_info_list) || []).forEach(g => (g.item_list || []).forEach(it => {
            const v = String(it.description || '').replace(/^ตัวเลือกสินค้า:\s*/, '').trim();
            items.push((String(it.name || '').replace(/\s+/g, ' ').slice(0, 50) + (v ? ' [' + v + ']' : '')).trim() + ' ×' + (it.amount || 1));
          }));
          rows.push({ order: (p.card_header && p.card_header.order_sn) || '', track: status === 2 ? ((f.tracking_number_list || [])[0] || '') : '',
            method: f.fulfilment_channel_name || '', shipBy: fmt(o.ship_by_date), items: items.join(' | ') });
        });
        await sleep(150);
      }
    }
    return rows;
  }
  /** ออเดอร์ "ยกเลิกแล้ว" ที่ต้องดึงกล่องออก (ยกเลิกหลังกดจัดส่ง / มีเลขพัสดุ) · ออเดอร์ที่ตรวจแล้วจำไว้ ไม่ขอซ้ำ */
  async function tsCancels(shop) {
    const post = (p, b) => fetch('/api/v3/order/' + p + '?SPC_CDS=' + cookie('SPC_CDS') + '&SPC_CDS_VER=2', { method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    const key = 'cxSeen_' + shop.toLowerCase();
    let seen = {}; try { seen = JSON.parse(GM_getValue(key, '{}')) || {}; } catch (e) { }
    const cd = new Date(Date.now() - TOSHIP_BACK_DAYS * 864e5), p2 = n => String(n).padStart(2, '0');
    const cut = String(cd.getFullYear()).slice(2) + p2(cd.getMonth() + 1) + p2(cd.getDate());   // เลขออเดอร์ขึ้นต้นด้วย ปปดดวว ที่สั่ง
    const list = [], done = [];
    for (let page = 1; page <= 2; page++) {                    // 80 ออเดอร์ยกเลิกล่าสุด · ดูเฉพาะที่สั่งใน TOSHIP_BACK_DAYS วัน (เท่าไฟล์รายงานเดิม)
      const r = await post('search_order_list_index', { order_list_tab: 600, entity_type: 1, pagination: { page_number: page, page_size: 40 }, sort: { sort_type: 3, ascending: false } });
      if (!r || r.code !== 0 || !r.data) throw new Error('อ่านออเดอร์ยกเลิกไม่ได้ (' + ((r && (r.user_message || r.message)) || 'ไม่มีข้อมูล') + ')');
      const L = r.data.index_list || [], fresh = L.filter(x => !seen[x.order_id]);
      for (let i = 0; i < fresh.length; i += 5) {
        const c = await post('get_order_list_card_list', { order_list_tab: 600, need_count_down_desc: false,
          order_param_list: fresh.slice(i, i + 5).map(x => ({ order_id: x.order_id, shop_id: x.shop_id, region_id: x.region_id })) });
        if (!c || c.code !== 0 || !c.data) throw new Error('อ่านรายละเอียดออเดอร์ยกเลิกไม่ได้ (' + ((c && (c.user_message || c.message)) || 'ไม่มีข้อมูล') + ')');
        (c.data.card_list || []).forEach(x => {
          const p = x.order_card || x.package_card || {}, sn = String((p.card_header && p.card_header.order_sn) || '');
          const oid = (p.order_ext_info && p.order_ext_info.order_id) || ''; if (oid) done.push(oid);
          if (!sn || sn.slice(0, 6) < cut) return;
          const reason = String((p.status_info && p.status_info.status_description && p.status_info.status_description.description_value) || '');
          const track = ((p.fulfilment_info && p.fulfilment_info.tracking_number_list) || [])[0] || '';
          if (!track && !/หลังจาก.*จัดส่ง/.test(reason)) return;  // ยกเลิกก่อนกดจัดส่ง = ไม่มีกล่อง
          const items = [];
          ((p.item_info_group && p.item_info_group.item_info_list) || []).forEach(g => (g.item_list || []).forEach(it => {
            const nm = String(it.name || '').replace(/^\(สินค้ามีตัวเลือก\)\s*/, '').replace(/\s+/g, ' ').trim();
            let v = String(it.description || '').replace(/^ตัวเลือกสินค้า:\s*/, '').replace(/^\[+|\]+$/g, '').replace(/\s+/g, ' ').trim();
            if (v && nm.indexOf(v.slice(0, 20)) === 0) v = '';      // บางการ์ดใส่ชื่อสินค้าซ้ำในช่องตัวเลือก
            items.push((nm.slice(0, 50) + (v ? ' [' + v.slice(0, 40) + ']' : '')).trim() + ' ×' + (it.amount || 1));
          }));
          list.push({ order: sn, track, reason, items: items.join(' | ') });
        });
        await sleep(150);
      }
      if (L.length < 40 || !fresh.length) break;               // หน้านี้ตรวจหมดแล้ว → หน้าถัดไปก็ตรวจแล้ว
    }
    return { list, commit() {                                  // จำไว้หลังส่งเข้าเซิร์ฟเวอร์สำเร็จเท่านั้น
      const now = Date.now(); done.forEach(id => { seen[id] = now; });
      Object.keys(seen).forEach(id => { if (now - seen[id] > 60 * 864e5) delete seen[id]; });
      GM_setValue(key, JSON.stringify(seen));
    } };
  }
  async function syncToShip(shop, why) {
    if (tsRunning || running) return; tsRunning = true;
    const k = shop.toLowerCase(), st = msg => { label.textContent = msg; };
    try {
      await withLock('toship|' + k, st, async () => {
        // ⚡ อ่านตรงจากหน้า Seller Centre: "ที่ต้องจัดส่ง" + "ยกเลิกแล้ว" (ไม่กี่วินาที) → กระดิ่งในแอปอัปเดตทันที
        try {
          st('⚡ [' + shop + '] อ่านรายการที่ต้องจัดส่ง + ออเดอร์ยกเลิก…');
          const t0 = Date.now(), rows = await tsList(), cx = await tsCancels(shop);
          const r = await api('shopeeToShipList', { shop, rows, cancels: cx.list });
          if (r && r.error) throw new Error(r.error);
          cx.commit();
          await sset('tsOk_' + k, Date.now());
          api('shopeeToShipState', { shop, ok: true, msg: rows.length + ' ออเดอร์ · ' + Math.round((Date.now() - t0) / 1000) + ' วิ' }, true).catch(() => {});
          st('🟢 [' + shop + '] อัปเดตแล้ว ' + new Date().toTimeString().slice(0, 5) + ' · ' + rows.filter(x => x.track).length + ' กล่อง' +
            (cx.list.length ? ' · ⛔ ยกเลิกหลังกดจัดส่ง ' + cx.list.length : '') + ' (' + Math.round((Date.now() - t0) / 1000) + ' วิ) • พร้อมรับคำขอจากแอป');
          return;
        } catch (e) { st('⚠️ [' + shop + '] อ่านจากหน้ารายการไม่ได้ (' + e.message + ') – ใช้ไฟล์รายงานแทน'); console.warn('[Packing Cam ⚡]', e); }
        // สำรอง: ไฟล์รายงาน (ช้า) – ใช้เมื่ออ่านจากหน้ารายการไม่ได้
        const d = new Date(); d.setDate(d.getDate() - TOSHIP_BACK_DAYS);
        const from = ymd(d), to = ymd(new Date());
        st('🚚 [' + shop + '] ดึงรายการที่ต้องจัดส่ง ' + from + ' → ' + to + (why ? ' (' + (why === 'auto' ? 'รอบอัตโนมัติ' : why) + ')' : '') + '…');
        let job;
        try { job = await ordRequest(from, to); }
        catch (e) { st('🚚 [' + shop + '] Shopee ให้รอ 1 นาที…'); await sleep(65000); job = await ordRequest(from, to); }
        if (job.n !== 0) {
          const f = await ordFetch(job, m => st('🚚 [' + shop + '] ' + m));
          await api('shopeeUpload', { shop, name: 'ToShip.' + from.replace(/-/g, '') + '_' + to.replace(/-/g, '') + '.xlsx', data: await blobToBase64(f.blob), importNow: true });
        } else await api('shopeeToShipList', { shop, rows: [] }).catch(() => {});   // ไม่มีออเดอร์ → บันทึกว่า 0 กล่อง (การ์ดในแอปจะไม่ค้าง "ยังไม่มีข้อมูล")
        await sset('tsOk_' + k, Date.now());
        api('shopeeToShipState', { shop, ok: true, msg: 'ใช้ไฟล์รายงาน' }, true).catch(() => {});
        st('🟢 [' + shop + '] อัปเดตที่ต้องจัดส่งแล้ว ' + new Date().toTimeString().slice(0, 5) + ' • พร้อมรับคำขอจากแอป');
      });
    } catch (e) { st('❌ ที่ต้องจัดส่ง: ' + e.message); console.warn('[Packing Cam ที่ต้องจัดส่ง]', e); api('shopeeToShipState', { shop, ok: false, msg: String(e.message || e).slice(0, 200) }, true).catch(() => {}); }
    finally { tsRunning = false; }
  }
  function toShipDue(shop, auto) {
    const last = +sget('tsOk_' + shop.toLowerCase(), 0);
    if (auto && auto.from) {                                  // ⏱ ตั้งในแอป (กระดิ่ง → ⏱) เช่น 09:30–14:30 ทุก 15 นาที
      if (!auto.on) return false;
      const d = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      if (hm < auto.from || hm > auto.to) return false;
      return Date.now() - last > (Number(auto.every) || 60) * 60000 - 30000;
    }
    const h = new Date().getHours();                          // เซิร์ฟเวอร์รุ่นเก่า → ทุกชั่วโมงตามเดิม
    if (h < TOSHIP_HOURS[0] || h > TOSHIP_HOURS[1]) return false;
    return Date.now() - last > 55 * 60000;
  }


  /* ================= 📄 รายงานการเงินรายเดือน (PDF) → Drive "เอกสารภาษี/Shopee/<ร้าน>" ================= */
  const ST = '/api/v4/accounting/pc/seller_income/income_statement/';
  const stPost = (p, b) => fetch(ST + p + '?SPC_CDS=' + cookie('SPC_CDS') + '&SPC_CDS_VER=2', { method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
  async function stPdf(month) {                                 // month = 'YYYY-MM'
    const [y, m] = month.split('-').map(Number), last = new Date(y, m, 0).getDate();
    const g = await stPost('request_income_statement_batch_generate',
      { statement_type: 'month', start_time: month.replace('-', '') + '01', end_time: month.replace('-', '') + String(last).padStart(2, '0') });
    if (g.code !== 0 || !g.document_id) throw new Error('Shopee ไม่สร้าง PDF ' + month + ': ' + (g.user_message || g.message || ''));
    const t0 = Date.now();
    for (;;) {
      await sleep(3000);
      const s = await stPost('get_generated_income_statements_by_ids', { document_ids: [g.document_id] });
      const d = s.list && s.list[0], stt = d && d.status;
      if (stt === 2 || stt === 3) break;
      if (s.code === 0 && stt !== 1) throw new Error('Shopee สร้าง PDF ' + month + ' ไม่สำเร็จ (สถานะ ' + stt + ')');
      if (Date.now() - t0 > 5 * 60e3) throw new Error('Shopee สร้าง PDF ' + month + ' นานเกิน 5 นาที');
    }
    const q = await fetch('/api/v4/accounting/pc/seller_income/income_report/query_income_report?document_id=' + g.document_id + cds(), { credentials: 'include' }).then(r => r.json());
    const path = q.data && q.data.file_path; if (!path) throw new Error('ไม่พบไฟล์ PDF ' + month);
    const r = await fetch('/api/v4/accounting/pc/seller_income/income_report/get_income_document_file?path=' + encodeURIComponent(path) +
      '&content_type=application%2Fpdf' + cds(), { credentials: 'include' });
    const blob = await r.blob();
    if (!r.ok || blob.size < 1000) throw new Error('ดาวน์โหลด PDF ' + month + ' ไม่ได้ (HTTP ' + r.status + ')');
    return blob;
  }
  /** PDF เดือนที่จบแล้วที่ยังไม่มีใน Drive (ย้อนหลัง INCOME_BACKFILL_MONTHS เดือน) */
  async function syncStatements(shop, st) {
    const have = new Set(((await api('taxDocList', { platform: 'Shopee', shop }, true)).months) || []);
    const months = [], d = new Date(); d.setDate(1);
    for (let i = 1; i <= INCOME_BACKFILL_MONTHS; i++) { d.setMonth(d.getMonth() - 1); months.push(ymd(d).slice(0, 7)); }
    const todo = months.filter(m => !have.has(m) && m >= '2025-01').reverse();
    let n = 0;
    for (const m of todo) {
      st('[' + shop + '] 📄 รายงานการเงิน PDF ' + m + ' (' + (n + 1) + '/' + todo.length + ')…');
      const blob = await stPdf(m);
      await api('taxDocUpload', { platform: 'Shopee', shop, month: m, kind: 'รายงานการเงิน', data: await blobToBase64(blob) });
      n++; await sleep(2000);
    }
    return n;
  }

  let incRunning = false;
  async function runIncome(force) {
    if (incRunning || running) return; incRunning = true;
    const st = msg => { label.textContent = '💰 ' + msg; };
    btn.disabled = true;
    try {
      if (!settings(false)) throw new Error('ยังไม่ได้ตั้งค่า');
      st('ตรวจบัญชีที่ล็อกอิน…');
      myAccount = await getAccount();
      if (!myAccount) throw new Error('อ่านชื่อบัญชีไม่ได้ – ล็อกอิน Seller Centre ก่อน');
      const shop = myShop = await shopOf(myAccount, true);
      const k = shop.toLowerCase();

      for (let i = 0; !(await incReady()); i++) {             // Shopee ถามรหัสผ่านก่อนเข้าหน้าการเงิน
        if (i > 120) throw new Error('ยังเข้าหน้าการเงินไม่ได้ – ใส่รหัสผ่านแล้วรีเฟรชหน้า');
        st('[' + shop + '] รอใส่รหัสผ่านของ Shopee…'); await sleep(5000);
      }
      await withLock('shopee|' + k, st, async () => {
      const today = ymd(new Date()), lastTo = sget('incTo_' + k, ''), lastOk = +sget('incOk_' + k, 0);
      if (!force && lastTo === today && Date.now() - lastOk < INCOME_SKIP_HOURS * 3600e3) {
        st('🟢 [' + shop + '] ดึงรายรับไปแล้วเมื่อ ' + new Date(lastOk).toTimeString().slice(0, 5) + ' • กดปุ่มเพื่อดึงอีกครั้ง');
        return;
      }
      // 1) คำสั่งซื้อ (ชื่อสินค้า/SKU/จำนวน) – ทำก่อนเพราะเร็ว · ผิดพลาดก็ทำรายรับต่อได้
      let ordN = 0, ordErr = '';
      try { ordN = await syncOrders(shop, k, st); } catch (e) { ordErr = e.message; console.warn('[Packing Cam คำสั่งซื้อ]', e); }

      // 1.5) PDF รายงานการเงินรายเดือน (แนบยื่นภาษี) – เฉพาะเดือนที่ยังไม่มีใน Drive
      let pdfN = 0, pdfErr = '';
      try { pdfN = await syncStatements(shop, st); } catch (e) { pdfErr = e.message; console.warn('[Packing Cam PDF]', e); }

      // 2) รายรับ (โอนแล้ว)
      let from;
      if (lastTo) from = addDays(lastTo, -INCOME_OVERLAP_DAYS);
      else { const d = new Date(); d.setMonth(d.getMonth() - INCOME_BACKFILL_MONTHS + 1, 1); from = ymd(d); }
      const chunks = incChunks(from, today);

      const jobs = [];                                         // สั่งเตรียมทุกเดือนพร้อมกัน แล้วค่อยเก็บทีละไฟล์ (เร็วกว่ารอทีละไฟล์)
      for (const [a, b] of chunks) {
        st('[' + shop + '] สั่งเตรียมไฟล์ ' + (jobs.length + 1) + '/' + chunks.length + ' (' + a + ' → ' + b + ')…');
        jobs.push(await incRequest(a, b)); await sleep(1500);
      }
      let n = 0, imp = null;
      for (const job of jobs) {
        const b = job.to;
        const f = await incFetch(job, m => st('[' + shop + '] (' + (n + 1) + '/' + jobs.length + ') ' + m));
        st('[' + shop + '] (' + (n + 1) + '/' + chunks.length + ') ส่ง ' + f.name + '…');
        const res = await api('shopeeUpload', {
          shop, name: f.name, data: await blobToBase64(f.blob),
          importNow: chunks.length === 1                       // หลายไฟล์ → ให้ระบบนำเข้าเองภายใน ~10 นาที (กันหมดเวลา)
        });
        if (res.imported) imp = res.imported;
        n++;
        await sset('incTo_' + k, b < today ? b : today);   // บันทึกทีละไฟล์ → หยุดกลางทางก็ทำต่อได้ (เครื่องอื่นทำต่อได้ด้วย)
      }
      await sset('incOk_' + k, Date.now());
      const t = new Date().toTimeString().slice(0, 5);
      const fin = imp && imp.fin && imp.fin[0];
      const impTxt = chunks.length > 1 ? ' • ระบบจะนำเข้าเข้า FIN_ ภายใน ~10 นาที'
        : !imp ? '' : imp.error ? ' • นำเข้าไม่สำเร็จ: ' + imp.error
        : imp.skipped ? ' • นำเข้าภายใน ~10 นาที'
        : fin ? ' • นำเข้าแล้ว ' + fin.orders + ' ออเดอร์ ' + (fin.ok ? '✓ ตรงกับหน้าสรุป' : '⚠️ ยอดไม่ตรง ดูแจ้งเตือน') : ' • นำเข้าแล้ว';
      st('✅ [' + shop + '] รายรับ ' + n + ' ไฟล์ · คำสั่งซื้อ ' + (ordErr ? '❌ ' + ordErr : ordN + ' ไฟล์') + ' · PDF ' + (pdfErr ? '❌ ' + pdfErr : pdfN + ' เดือน') + ' (' + chunks[0][0] + ' → ' + today + ') เวลา ' + t + impTxt);
      });
    } catch (e) {
      st('❌ ' + e.message);
      console.warn('[Packing Cam รายรับ]', e);
    } finally {
      incRunning = false; btn.disabled = false;
    }
  }


  /* ================= 🏪 LnwShop (a.lnwstore.com) → โฟลเดอร์ LnwShop → FIN_ / SALES_ ================= */
  const LNW_FOLDER = 'LnwShop';                                // ชื่อโฟลเดอร์ใน Drive "Shopee Import/LnwShop"
  const LNW_CHUNK_DAYS = 7;                                    // ไฟล์ละไม่เกิน 7 วัน (LnwShop ให้สูงสุด 2,000 ออเดอร์ต่อไฟล์)
  const LNW_OVERLAP_DAYS = 7;
  const lnwSlug = () => (location.hostname === 'a.lnwstore.com' && location.pathname.split('/')[1]) || '';
  const onLnw = () => !!lnwSlug() && !/^(pure|static|assets)$/.test(lnwSlug()) && !/print|pdf|label|invoice|shipping|slip/i.test(location.pathname + location.search);   // ไม่ทำงานในหน้าพิมพ์
  let lnwRunning = false;

  async function lnwFetch(from, to) {
    const url = '/' + lnwSlug() + '/pure/lab/order_report/?from_date=' + from + '&to_date=' + to + '&only_active=1&time_key=acceptpayment_time';
    const r = await fetch(url, { credentials: 'include' });
    const cd = r.headers.get('content-disposition') || '';
    if (!r.ok || !/spreadsheet|octet/.test(r.headers.get('content-type') || '')) {
      const t = (await r.text().catch(() => '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 100);
      throw new Error('LnwShop ไม่ส่งไฟล์ (' + from + ' → ' + to + ', HTTP ' + r.status + ')' + (t ? ': ' + t : '') + ' – ล็อกอินใหม่');
    }
    const m = cd.match(/order_statement_(\d+)_(\d+)/), n = m ? +m[2] - +m[1] + 1 : -1;
    return { blob: await r.blob(), n };
  }
  /** ดึงช่วงวันที่ · ถ้าเต็ม 2,000 ออเดอร์ (อาจตกหล่น) → แบ่งครึ่งช่วงแล้วดึงใหม่ */
  async function lnwRange(from, to, st, out) {
    st('🏪 ดึง LnwShop ' + from + ' → ' + to + '…');
    const f = await lnwFetch(from, to);
    if (f.n >= 2000 && from < to) {
      const days = Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 864e5);
      const mid = addDays(from, Math.floor(days / 2));
      await lnwRange(from, mid, st, out); await lnwRange(addDays(mid, 1), to, st, out);
      return;
    }
    out.push({ from, to, blob: f.blob });
  }
  async function runLnw(force) {
    if (lnwRunning) return; lnwRunning = true;
    const st = msg => { label.textContent = msg; };
    btn.disabled = true;
    try {
      if (!settings(false)) throw new Error('ยังไม่ได้ตั้งค่า');
      await withLock('lnwshop', st, async () => {
      const today = ymd(new Date()), lastTo = sget('lnwTo', ''), lastOk = +sget('lnwOk', 0);
      if (!force && lastTo === today && Date.now() - lastOk < INCOME_SKIP_HOURS * 3600e3) {
        st('🟢 LnwShop ดึงไปแล้วเมื่อ ' + new Date(lastOk).toTimeString().slice(0, 5) + ' • กดปุ่มเพื่อดึงอีกครั้ง'); return;
      }
      let from;
      if (lastTo) from = addDays(lastTo, -LNW_OVERLAP_DAYS);
      else { const d = new Date(); d.setMonth(d.getMonth() - INCOME_BACKFILL_MONTHS + 1, 1); from = ymd(d); }
      const chunks = [];
      for (let a = from; a <= today; a = addDays(a, LNW_CHUNK_DAYS)) { const b = addDays(a, LNW_CHUNK_DAYS - 1); chunks.push([a, b < today ? b : today]); }
      let n = 0;
      for (const [a, b] of chunks) {
        const files = [];
        await lnwRange(a, b, m => st('🏪 (' + (n + 1) + '/' + chunks.length + ') ' + m.replace('🏪 ', '')), files);
        for (const f of files) {
          st('🏪 (' + (n + 1) + '/' + chunks.length + ') ส่งไฟล์ ' + f.from + ' → ' + f.to + '…');
          await api('shopeeUpload', { shop: LNW_FOLDER, name: 'order_statement_' + f.from.replace(/-/g, '') + '_' + f.to.replace(/-/g, '') + '.xlsx',
            data: await blobToBase64(f.blob), importNow: chunks.length === 1 });
        }
        await sset('lnwTo', b);                                 // บันทึกทีละช่วง → หยุดกลางทางก็ทำต่อได้
        n++;
        await sleep(1500);
      }
      await sset('lnwOk', Date.now());
      st('✅ LnwShop ส่ง ' + n + ' ช่วง (' + from + ' → ' + today + ') เวลา ' + new Date().toTimeString().slice(0, 5) + ' • ระบบนำเข้าเข้า FIN_ ภายใน ~10–30 นาที');
      });
    } catch (e) {
      st('❌ ' + e.message + (/ไม่พบโฟลเดอร์ร้าน/.test(e.message) ? ' – รอระบบสร้างโฟลเดอร์ LnwShop (~10 นาทีหลังติดตั้ง lnwshop.gs) แล้วลองใหม่' : ''));
      console.warn('[Packing Cam LnwShop]', e);
    } finally { lnwRunning = false; btn.disabled = false; }
  }


  /* ================= 📄 Lazada: PDF สรุปธุรกรรมรายเดือน → Drive "เอกสารภาษี/Lazada/<ร้าน>" ================= */
  const LZ_SHOP = 'KengAmp';                                   // ชื่อร้าน Lazada (ตรงกับ FIN_Lines / TAX_Payers)
  const onLazada = () => location.hostname === 'sellercenter.lazada.co.th' && /\/finance\//.test(location.pathname);
  let lzRunning = false;
  function lzReq(api, data) {
    const mt = unsafeWindow.lib && unsafeWindow.lib.mtop;
    if (!mt) return Promise.reject(new Error('หน้า Lazada ยังโหลดไม่เสร็จ – รีเฟรชแล้วลองใหม่'));
    return mt.request({ v: '1.0', appKey: '4272', timeout: 30000, H5Request: true, type: 'GET', method: 'GET', api, url: api,
      data: Object.assign({ _timezone: -7 }, data), dataType: 'json', valueType: 'original', 'x-i18n-regionID': 'LAZADA_TH' });
  }
  function gmBlob(url) {
    return new Promise((res, rej) => GM_xmlhttpRequest({ method: 'GET', url, responseType: 'blob', timeout: 120000,
      onload: r => r.status === 200 && r.response && r.response.size > 1000 ? res(r.response) : rej(new Error('ดาวน์โหลด PDF Lazada ไม่ได้ (HTTP ' + r.status + ')')),
      onerror: () => rej(new Error('ดาวน์โหลด PDF Lazada ไม่ได้')), ontimeout: () => rej(new Error('ดาวน์โหลด PDF Lazada ช้าเกินไป')) }));
  }
  async function lzPdf(month) {                                 // 'YYYY-MM'
    const [y, m] = month.split('-').map(Number);
    const start = Date.UTC(y, m - 1, 1) - 7 * 3600e3, end = Date.UTC(y, m, 1) - 7 * 3600e3 - 1000;   // เวลาไทย
    const c = await lzReq('mtop.lazada.finance.sellerfund.statementPdf.createTask', { startDate: start, endDate: end });
    const id = c && c.data && c.data.data;
    if (!id) throw new Error('Lazada ไม่สร้าง PDF ' + month + ': ' + ((c && c.data && c.data.errorMsg) || ''));
    const t0 = Date.now();
    for (;;) {
      await sleep(3000);
      const q = await lzReq('mtop.lazada.finance.sellerfund.statementPdf.queryTask', { current: 1, pageSize: 20 });
      const f = ((q && q.data && q.data.data && q.data.data.dataSource) || []).find(x => x.id === id);
      if (f && f.statusCode === 2 && f.outputFile) return gmBlob(f.outputFile);
      if (f && f.statusCode > 2) throw new Error('Lazada สร้าง PDF ' + month + ' ไม่สำเร็จ (' + f.status + ')');
      if (Date.now() - t0 > 5 * 60e3) throw new Error('Lazada สร้าง PDF ' + month + ' นานเกิน 5 นาที');
    }
  }
  async function runLazada(force) {
    if (lzRunning) return; lzRunning = true;
    const st = msg => { label.textContent = msg; };
    btn.disabled = true;
    try {
      if (!settings(false)) throw new Error('ยังไม่ได้ตั้งค่า');
      await withLock('lazada', st, async () => {
      const lastOk = +sget('lzPdfOk', 0);
      if (!force && Date.now() - lastOk < INCOME_SKIP_HOURS * 3600e3) {
        st('🟢 Lazada PDF ตรวจไปแล้วเมื่อ ' + new Date(lastOk).toTimeString().slice(0, 5) + ' • กดปุ่มเพื่อตรวจอีกครั้ง'); return;
      }
      for (let i = 0; i < 20 && !(unsafeWindow.lib && unsafeWindow.lib.mtop); i++) await sleep(1000);
      const have = new Set(((await api('taxDocList', { platform: 'Lazada', shop: LZ_SHOP }, true)).months) || []);
      const months = [], d = new Date(); d.setDate(1);
      for (let i = 1; i <= INCOME_BACKFILL_MONTHS; i++) { d.setMonth(d.getMonth() - 1); months.push(ymd(d).slice(0, 7)); }
      const todo = months.filter(m => !have.has(m)).reverse();
      let n = 0; const fails = [];
      for (const m of todo) {
        try {
          st('📄 Lazada PDF ' + m + ' (' + (n + fails.length + 1) + '/' + todo.length + ')…');
          const blob = await lzPdf(m);
          await api('taxDocUpload', { platform: 'Lazada', shop: LZ_SHOP, month: m, kind: 'รายงานการเงิน', data: await blobToBase64(blob) });
          n++;
        } catch (e) { fails.push(m + ': ' + e.message); console.warn('[Packing Cam Lazada PDF]', e); }
        await sleep(2000);
      }
      await sset('lzPdfOk', Date.now());
      st((fails.length ? '⚠️' : '✅') + ' Lazada PDF ใหม่ ' + n + ' เดือน' + (todo.length ? '' : ' (มีครบแล้ว)') + (fails.length ? ' · ไม่สำเร็จ ' + fails.length + ' – ' + fails[0] : '') +
        ' เวลา ' + new Date().toTimeString().slice(0, 5));
      });
    } catch (e) {
      st('❌ ' + e.message); console.warn('[Packing Cam Lazada]', e);
    } finally { lzRunning = false; btn.disabled = false; }
  }

  /* ---------------- UI ---------------- */
  const box = document.createElement('div');
  box.id = 'pcAutoBox';
  const pst = document.createElement('style');                 // ไม่ให้ปุ่ม/ข้อความของสคริปต์ติดไปตอนสั่งพิมพ์
  pst.textContent = '@media print{#pcAutoBox{display:none!important}}';
  document.head.appendChild(pst);
  box.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:99999;display:none;flex-direction:column;align-items:flex-end;gap:6px;font-family:system-ui,-apple-system,sans-serif';
  const btn = document.createElement('button');
  btn.textContent = '⚡ ดึงรายการคืน → Packing Cam';
  btn.style.cssText = 'background:#ee4d2d;color:#fff;border:0;border-radius:24px;padding:14px 22px;font-size:16px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer';
  const label = document.createElement('div');
  label.style.cssText = 'background:rgba(0,0,0,.8);color:#fff;border-radius:10px;padding:8px 12px;font-size:13px;max-width:380px;line-height:1.5';
  label.textContent = 'กำลังเตรียม…';
  btn.onclick = () => onLazada() ? runLazada(true) : onLnw() ? runLnw(true) : onIncome() ? runIncome(true) : run('', 'manual');
  box.append(label, btn);
  document.body.appendChild(box);
  let wasIncome = false, wasLnw = false, wasLz = false;
  setInterval(() => {
    box.style.display = onPage() || onIncome() || onLnw() || onLazada() ? 'flex' : 'none';
    btn.textContent = onLazada() ? '📄 PDF Lazada → Drive' : onLnw() ? '🏪 ดึง LnwShop → FIN' : onIncome() ? '💰 ดึงรายรับ → FIN' : '⚡ ดึงรายการคืน → Packing Cam';
    const lnw = onLnw();
    if (lnw && !wasLnw) { label.textContent = '🏪 เตรียมดึง LnwShop…'; setTimeout(() => runLnw(false), 2500); }   // เปิดหลังร้าน LnwShop → ดึงเอง
    wasLnw = lnw;
    const lzOn = onLazada();
    if (lzOn && !wasLz) { label.textContent = '📄 เตรียมตรวจ PDF Lazada…'; setTimeout(() => runLazada(false), 3000); }   // เปิดหน้าการเงิน Lazada → ดึงเอง
    wasLz = lzOn;
    const inc = onIncome();
    if (inc && !wasIncome) { label.textContent = '💰 เตรียมดึงรายรับ…'; setTimeout(() => runIncome(false), 2500); }   // เข้าหน้ารายรับ → ดึงเอง
    wasIncome = inc;
  }, 1000);

  /* ================= 🏷️ หน้าพิมพ์ของ LnwShop (ใบจัดสินค้า): ใส่รหัส POS หน้าสินค้าทุกบรรทัด + เรียงตามรหัส POS =================
   * อ่านรหัสสินค้า LnwShop (ตัวเลขหน้าช่อง "รหัสสินค้า") → หารหัส POS จากคอลัมน์ AO ของชีต Product (ผ่าน Packing Cam)
   * แค่แต่งหน้าที่แสดงอยู่ ไม่กดพิมพ์ ไม่แก้ออเดอร์ · รหัสดึงใหม่ทุกครั้งที่เปิดหน้า (เซิร์ฟเวอร์จำไว้ 5 นาที) */
  (async function lnwPrintPos() {
    if (location.hostname !== 'a.lnwstore.com' || !/\/print\/preview\//.test(location.pathname)) return;
    let map = null, names = {}, skus = {}, err = '';
    try { const r = await api('posCodes', {}, true); map = r.map || {}; names = r.names || {}; skus = r.skus || {}; } catch (e) { err = e.message; }
    const skey = t => String(t || '').toLowerCase().replace(/\s+/g, '').slice(0, 160);   // = posSkuKey_ ใน Code.gs
    // ชื่อ/รหัส LnwShop ของสินค้าแต่ละบรรทัด: อ่านจากข้อมูลออเดอร์ที่ฝังในหน้านี้ (ช่อง "รหัสสินค้า" บางตัวเป็นข้อความ ไม่ใช่รหัส LnwShop)
    const nkey = t => String(t || '').toLowerCase().replace(/\(มีตัวเลือก\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/[\s\-_.,\/()⊳:]+/g, '').slice(0, 160);   // = posNameKey_ ใน Code.gs
    const byThumb = {}, byName = {}, byCode = {}, thumbN = {}, ordInfo = {};
    try {
      const h = await fetch(location.href, { credentials: 'include' }).then(r => r.text());
      const i0 = h.indexOf('var orders = [{'); if (i0 >= 0) {
        let i = h.indexOf('[', i0), d = 0, q = '', j = i;
        for (; j < h.length; j++) { const c = h[j]; if (q) { if (c === '\\') j++; else if (c === q) q = ''; continue; } if (c === '"' || c === "'") q = c; else if (c === '[' || c === '{') d++; else if (c === ']' || c === '}') { d--; if (!d) break; } }
        const ordersData = JSON.parse(h.slice(i, j + 1));
        ordersData.forEach(o => {   // หัวใบจัดของ: เลขพัสดุ + ช่องทางการสั่งซื้อ (ร้าน)
          const cd = o.channel_data || {}, track = ((o.trackcodes || []).map(t => t && (t.code_text || t.code)).filter(Boolean)[0]) || '';
          const ch = cd.name || o.channel || '', shop = cd.shop_name || '';
          ordInfo[String(o.id)] = { track, channel: ch ? ch + (shop ? ' (' + shop + ')' : '') : 'หน้าร้าน' };
        });
        ordersData.forEach(o => (o.product_items || []).forEach(it => {
          const pid = String((it.spec && it.spec.product_id) || (it.product && it.product.id) || ''), x = { pid, code: (it.product && it.product.code) || '', names: [it.name, it.product && it.product.title, it.product && it.product.name] };
          if (it.thumbnail) { byThumb[it.thumbnail] = x; thumbN[it.thumbnail] = (thumbN[it.thumbnail] || 0) + 1; }   // ตัวเลือกของสินค้าเดียวกันใช้รูปเดียวกัน → ใช้รูปจับคู่ได้เฉพาะรูปที่ไม่ซ้ำ
          if (x.code) { const kc = skey(x.code); if (kc && !byCode[kc]) byCode[kc] = x; }
          x.names.forEach(n => { const k = nkey(n); if (k && !byName[k]) byName[k] = x; });
        }));
      }
    } catch (e) { console.warn('[Packing Cam รหัส POS] อ่านข้อมูลออเดอร์ไม่ได้', e); }
    const css = document.createElement('style');
    css.textContent = '.pc-pos{font-weight:800;font-size:1.1em;line-height:1.15;letter-spacing:-.2px;color:#000;margin-bottom:3px;white-space:normal;overflow-wrap:anywhere;word-break:break-word}.pc-pos.none{font-weight:600;font-size:.85em;color:#999}' +
      '#pc-pos-note{position:fixed;right:12px;bottom:12px;z-index:99999;background:#1b7a4b;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:8px 12px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.25)}#pc-pos-note.err{background:#c62828}.first-zone{position:relative}.pc-qr{position:absolute;right:0;top:0;width:22mm;height:22mm;display:block;z-index:2}#pc-pos-note button{margin-left:6px;border:0;border-radius:8px;padding:4px 10px;font:700 12px system-ui,sans-serif;cursor:pointer;background:#fff;color:#1b7a4b}@media print{#pc-pos-note{display:none!important}}';
    document.head.appendChild(css);
    const note = document.createElement('div'); note.id = 'pc-pos-note'; document.body.appendChild(note);
    const noteTxt = note.appendChild(document.createElement('span')), noteBtn = note.appendChild(document.createElement('button'));
    // ลำดับรายการ: ค่าเริ่มต้น = ตามใบปะหน้า (ลำดับเดิมของ LnwShop ตรงกับใบปะหน้า Shopee/Lazada) · กดสลับเป็นเรียงตามรหัส POS ได้ (จำไว้ในเครื่อง)
    let sortPos = false; try { sortPos = localStorage.getItem('pcPosSort') === '1'; } catch (e) { }
    noteBtn.onclick = () => { sortPos = !sortPos; try { localStorage.setItem('pcPosSort', sortPos ? '1' : '0'); } catch (e) { } apply(); };
    // ⚙ ตั้งค่าใบจัดสินค้า (จำไว้ในเครื่อง): ขนาดหัวใบ · กรอบแดงหน้าหลายหน้า/ตัวเลือกสินค้า · ข้อความท้ายใบ
    const PS_DEF = { titleSize: 15, imgInCode: true, qtySize: 0, qtyBold: true, boxMulti: true, boxVariant: true, footText: '', footSize: 12 };
    let ps = Object.assign({}, PS_DEF); try { Object.assign(ps, JSON.parse(localStorage.getItem('pcPickSet') || '{}')); } catch (e) { }
    const psCss = document.head.appendChild(document.createElement('style'));
    const psApply = () => {
      psCss.textContent = '.header h1{font-size:' + (+ps.titleSize || 15) + 'px!important;line-height:1.2!important}' +
        '.tr.item .td.quantity{' + (+ps.qtySize > 0 ? 'font-size:' + (+ps.qtySize) + 'px!important;line-height:1.1!important;' : '') + (ps.qtyBold ? 'font-weight:800!important;' : '') + '}' +
        (ps.boxMulti ? '.pagecount.pc-multi{border:2px solid #e00;border-radius:4px;padding:1px 6px;font-weight:700;color:#000}' : '') +
        (ps.boxVariant ? '.child_name{display:inline-block!important;width:auto!important;max-width:100%;box-sizing:border-box;border:2px solid #e00;border-radius:4px;padding:0 6px 0 2px;margin-top:2px}' : '') +
        '.td.code img.pc-img{display:block;width:100%;height:auto;margin:0}.pc-codebox{margin:0 0 2px}.pc-codebox .pc-pos{display:inline;margin-right:6px}.pc-codebox span{color:#333}' +
        '.pc-foot{margin-top:2mm;border:1.5px dashed #000;border-radius:2mm;padding:1.5mm 2mm;text-align:center;font-weight:700;line-height:1.35;white-space:pre-wrap;font-size:' + (+ps.footSize || 12) + 'px}' +
        '#pc-ps{margin-top:8px;background:#fff;color:#111;border-radius:8px;padding:8px 10px;font:500 13px/1.5 system-ui,sans-serif;width:300px}#pc-ps label{display:flex;gap:6px;align-items:center;margin:4px 0}#pc-ps input[type=number]{width:60px}#pc-ps textarea{width:100%;box-sizing:border-box;font:inherit}';
    };
    psApply();
    const psSave = () => { try { localStorage.setItem('pcPickSet', JSON.stringify(ps)); } catch (e) { } psApply(); apply(); };
    const psBtn = note.appendChild(document.createElement('button')); psBtn.textContent = '⚙';
    psBtn.onclick = () => {
      let box = document.getElementById('pc-ps'); if (box) { box.remove(); return; }
      box = note.appendChild(document.createElement('div')); box.id = 'pc-ps';
      box.innerHTML = '<label>ขนาดหัวใบ (ใบจัดสินค้า / เลขพัสดุ) <input type="number" min="10" max="40" data-k="titleSize"> px</label>' +
        '<label>ขนาดตัวเลขจำนวน (Qty) <input type="number" min="0" max="40" data-k="qtySize"> px <span style="color:#888">(0 = เดิม)</span></label>' +
        '<label><input type="checkbox" data-k="qtyBold"> ตัวเลขจำนวนตัวหนา</label>' +
        '<label><input type="checkbox" data-k="imgInCode"> ย้ายรูปไปช่องแรก + รหัสไว้บนชื่อสินค้า <span style="color:#888">(เปลี่ยนแล้วเปิดหน้าใหม่)</span></label>' +
        '<label><input type="checkbox" data-k="boxMulti"> กรอบแดง "OID … หน้า x/y" เมื่อใบยาวหลายหน้า</label>' +
        '<label><input type="checkbox" data-k="boxVariant"> กรอบแดงตัวเลือกสินค้า (⊳ …)</label>' +
        '<div style="margin-top:6px;font-weight:700">ข้อความท้ายใบ (ว่าง = ไม่แสดง)</div><textarea rows="3" data-k="footText" placeholder="เช่น โปรโมชั่นลด 10% เมื่อสั่งซื้อผ่าน kengamp.lnwshop.com ติดต่อ Line : @kengamp"></textarea>' +
        '<label>ขนาดข้อความท้ายใบ <input type="number" min="8" max="30" data-k="footSize"> px</label>';
      box.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k;
        if (el.type === 'checkbox') { el.checked = !!ps[k]; el.onchange = () => { ps[k] = el.checked; psSave(); }; }
        else { el.value = ps[k]; el.oninput = () => { ps[k] = el.type === 'number' ? Number(el.value) : el.value.slice(0, 400); psSave(); }; }
      });
    };
    const posErr = !map; if (!map) map = {};   // ดึงรหัส POS ไม่ได้ → ยังแก้หัวใบ/เรียงได้ แต่บอกในป้าย
    const cmp = (a, b) => (a ? 0 : 1) - (b ? 0 : 1) || String(a).localeCompare(String(b), 'en', { numeric: true });
    // ย้ายรูปสินค้าไปช่องแรก (หัวข้อ "รูป") · รหัส POS + รหัสสินค้าเดิม ขึ้นไปอยู่บนชื่อสินค้า (ทำครั้งเดียวต่อแถว · ปิดใน ⚙ แล้วเปิดหน้าใหม่)
    function pickLayout(tr, td) {
      if (tr.dataset.pcLay === '1') return tr.querySelector('.pc-codebox') || td;
      if (!ps.imgInCode) return td;
      const desc = tr.querySelector('.td.description'), pn = desc && (desc.querySelector('.proname') || desc);
      if (!pn) return td;
      const img = desc.querySelector('img');
      const cb = document.createElement('div'); cb.className = 'pc-codebox';
      [...td.childNodes].forEach(n => cb.appendChild(n));
      pn.insertBefore(cb, pn.firstChild);
      if (img) { img.classList.add('pc-img'); td.appendChild(img); }
      tr.dataset.pcLay = '1';
      return cb;
    }
    let busy = false;
    const apply = () => {
      if (busy) return; busy = true;
      try {
        // หัวใบ: "ใบจัดสินค้า / เลขพัสดุ" · บรรทัด "ผู้รับสินค้า" → "ช่องทางการสั่งซื้อ: Lazada (KengAmp2555)"
        let curOid = '';
        document.querySelectorAll('.page').forEach(pg => {
          const pc = pg.querySelector('.pagecount'), di = pg.querySelector('.inforow.docid .info');
          const m = /#\s*(\d+)/.exec((pc && pc.textContent) || (di && di.textContent) || ''); if (m) curOid = m[1];
          const oi = ordInfo[curOid]; if (!oi) return;
          const h1 = pg.querySelector('.header h1');
          if (h1) { const want = 'ใบจัดสินค้า' + (oi.track ? ' / ' + oi.track : ''); if (h1.dataset.pc !== want) { h1.dataset.pc = want; h1.textContent = want; } }
          // QR เลขพัสดุ (ด้านขวาของส่วนข้อมูล เฉพาะหน้าแรกของออเดอร์)
          const fz = di && pg.querySelector('.first-zone');
          if (fz && oi.track && window.LZL_QR) {
            let qv = fz.querySelector(':scope > .pc-qr');
            if (!qv || qv.dataset.t !== oi.track) {
              if (qv) qv.remove();
              const mx = window.LZL_QR(oi.track, 'M'), n = mx.length, N = n + 4, NS = 'http://www.w3.org/2000/svg';
              qv = document.createElementNS(NS, 'svg'); qv.setAttribute('class', 'pc-qr'); qv.setAttribute('viewBox', '0 0 ' + N + ' ' + N); qv.setAttribute('shape-rendering', 'crispEdges'); qv.dataset.t = oi.track;
              let d = ''; mx.forEach((row, r) => row.forEach((v, c) => { if (v) d += 'M' + (c + 2) + ' ' + (r + 2) + 'h1v1h-1z'; }));
              const pa = document.createElementNS(NS, 'path'); pa.setAttribute('d', d); pa.setAttribute('fill', '#000'); qv.appendChild(pa);
              fz.appendChild(qv);
            }
          }
          const pcn = pg.querySelector('.pagecount');   // ใบยาวหลายหน้า → กรอบแดง
          if (pcn) { const mm = /หน้า\s*\d+\s*\/\s*(\d+)/.exec(pcn.textContent); pcn.classList.toggle('pc-multi', !!(mm && +mm[1] > 1)); }
          const lz = pg.querySelector('.last-zone');   // ข้อความท้ายใบ (หน้าสุดท้ายของออเดอร์)
          if (lz && lz.querySelector('.itemstotal')) { let ft = lz.querySelector(':scope > .pc-foot'); const tx = String(ps.footText || '').trim();
            if (!tx) { if (ft) ft.remove(); } else { if (!ft) { ft = document.createElement('div'); ft.className = 'pc-foot'; lz.appendChild(ft); } if (ft.textContent !== tx) ft.textContent = tx; } }
          const cr = pg.querySelector('.inforow.customer');
          if (cr) { const t = cr.querySelector('.title'), v = cr.querySelector('.info');
            if (t && t.textContent !== 'ช่องทางการสั่งซื้อ') t.textContent = 'ช่องทางการสั่งซื้อ';
            if (v && v.textContent !== oi.channel) v.textContent = oi.channel; }
        });
        if (ps.imgInCode) document.querySelectorAll('.itemslist.thead .th.code').forEach(th => { if (th.dataset.pc !== '1') { th.dataset.pc = '1'; th.innerHTML = 'รูป<br>Image'; } });
        let hit = 0, miss = 0, seq = 0;
        const groups = new Map();   // ออเดอร์เดียวกันที่ยาวหลายหน้า (OID #49954 หน้า 1/2, 2/2) → เรียง/นับเลขต่อกันทั้งออเดอร์
        document.querySelectorAll('.itemslist').forEach((list, li) => {
          const rows = [...list.children].filter(x => x.classList.contains('item'));
          if (!rows.length) return;
          const pg = list.closest('.page'), pc = pg && pg.querySelector('.pagecount');
          const gk = (pc ? pc.textContent.replace(/หน้า[\s\S]*$/, '').trim() : '') || ('list' + li);
          if (!groups.has(gk)) groups.set(gk, []); groups.get(gk).push(list);
          rows.forEach(tr => {
            if (!tr.dataset.pcIdx) tr.dataset.pcIdx = String(seq);   // ลำดับเดิมของ LnwShop (จำครั้งแรก)
            seq++;
            const td = tr.querySelector('.td.code'); if (!td) return;
            // อ่านค่าเดิมครั้งแรก (ก่อนย้ายรูป/รหัส) แล้วจำไว้ในแถว
            if (tr.dataset.pcRaw == null) { const pn0 = tr.querySelector('.proname') || tr.querySelector('.td.description'); tr.dataset.pcRaw = (td.querySelector('span:not(.pc-pos)') || td).textContent; tr.dataset.pcName = pn0 ? pn0.textContent : ''; }
            const box = pickLayout(tr, td);   // ที่วางรหัส POS: บนชื่อสินค้า (ถ้าย้ายรูปไปช่องแรก) หรือช่องรหัสเดิม
            let tag = box.querySelector(':scope > .pc-pos');
            const img = tr.querySelector('img.pc-img') || tr.querySelector('.td.description img');
            const raw = tr.dataset.pcRaw, m = /^\s*(\d+)\s*\//.exec(raw), src = img && img.getAttribute('src');
            const rowName = tr.dataset.pcName || '', it = byCode[skey(raw)] || byName[nkey(rowName)] || (src && thumbN[src] === 1 ? byThumb[src] : null);
            const pid = (it && it.pid) || (m ? m[1] : '');
            // 1) SKU แพลตฟอร์ม (คอลัมน์ BI) → 2) pid LnwShop (AO) → 3) ชื่อสินค้า
            let code = skus[skey(raw)] || skus[skey(it && it.code)] || (pid ? (map[pid] || '') : '');
            if (!code) [rowName].concat(it ? it.names : []).some(n => (code = names[nkey(n)] || '') !== '');   // ไม่มีรหัส LnwShop ใน POS → เทียบชื่อ
            if (!tag) { tag = document.createElement('div'); box.insertBefore(tag, box.firstChild); }
            if (tag.dataset.pid !== pid + '|' + code) { tag.dataset.pid = pid + '|' + code; tag.className = 'pc-pos' + (code ? '' : ' none'); tag.textContent = code || '—'; }
            tr.dataset.pcCode = code; code ? hit++ : miss++;
          });
        });
        // เรียงตามรหัส POS ทั้งออเดอร์ (ข้ามหน้าได้) · แต่ละหน้าคงจำนวนแถวเท่าเดิม (ไม่ล้นหน้า) · เลขลำดับต่อกันทุกหน้า
        groups.forEach(lists => {
          const slots = lists.map(l => [...l.children].filter(x => x.classList.contains('item')));
          const all = [].concat(...slots), idx = tr => Number(tr.dataset.pcIdx) || 0;
          const sorted = all.slice().sort((a, b) => (sortPos ? cmp(a.dataset.pcCode, b.dataset.pcCode) : 0) || idx(a) - idx(b));
          const anchors = slots.map(sl => { let n = sl[sl.length - 1].nextSibling; while (n && n.classList && n.classList.contains('item')) n = n.nextSibling; return n; });   // จุดวางท้ายแถวของแต่ละหน้า (คิดก่อนย้าย)
          let k = 0;
          lists.forEach((l, li) => {
            const want = sorted.slice(k, k + slots[li].length); k += slots[li].length;
            if (want.some((tr, i) => slots[li][i] !== tr)) want.forEach(tr => l.insertBefore(tr, anchors[li] && anchors[li].parentNode === l ? anchors[li] : null));   // ย้ายเฉพาะเมื่อลำดับยังไม่ตรง (กันวนไม่รู้จบกับ MutationObserver)
          });
          sorted.forEach((tr, i) => { tr.style.order = ''; const n = tr.querySelector('.td.number'); if (n && n.textContent !== (i + 1) + '.') n.textContent = (i + 1) + '.'; });
        });
        // เนื้อหาเกินหน้า (หัวใบใหญ่ขึ้น / ข้อความท้ายใบ / รหัส POS) → ย่อทั้งหน้าให้พอดี ไม่ให้ถูกตัดตอนพิมพ์
        document.querySelectorAll('.page').forEach(pg => {
          const pane = pg.querySelector(':scope > .pane'); if (!pane) return;
          if (pane.style.transform) pane.style.transform = '';
          const H = pane.clientHeight, h = pane.scrollHeight;   // พื้นที่จริง = กล่อง .pane (หน้าเว้นขอบไว้แล้ว)
          if (H && h > H + 1) { const sc = Math.max(0.6, (H - 2) / h); pane.style.transformOrigin = '50% 0'; pane.style.transform = 'scale(' + sc.toFixed(3) + ')'; }
        });
        const nt = (posErr ? '⚠️ ดึงรหัส POS ไม่ได้: ' + err + ' · ' : '') + '🏷️ รหัส POS ' + hit + ' รายการ' + (miss ? ' · ไม่พบ ' + miss : '') + (sortPos ? ' · เรียงตามรหัส POS' : ' · เรียงตามใบปะหน้า');
        const ncls = posErr ? 'err' : ''; if (note.className !== ncls) note.className = ncls; if (noteTxt.textContent !== nt) noteTxt.textContent = nt;
        const bt = sortPos ? '↩ เรียงตามใบปะหน้า' : '🔤 เรียงตามรหัส POS'; if (noteBtn.textContent !== bt) noteBtn.textContent = bt;   // เขียนเฉพาะเมื่อเปลี่ยน (กัน MutationObserver เรียกซ้ำไม่หยุด)
      } finally { busy = false; }
    };
    const quiet = n => { const e = n && (n.nodeType === 1 ? n : n.parentElement); return !!(e && e.closest && e.closest('.issuedate, #pc-pos-note')); };   // นาฬิกาเวลาพิมพ์เดินทุกวินาที → ไม่ต้องคำนวณใหม่
    let t = 0; new MutationObserver(ms => { if (ms.every(m => quiet(m.target))) return; clearTimeout(t); t = setTimeout(apply, 250); }).observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener('load', e => { if (e.target && e.target.tagName === 'IMG') { clearTimeout(t); t = setTimeout(apply, 250); } }, true);   // รูปโหลดเสร็จ → ความสูงเปลี่ยน → ย่อหน้าใหม่ (ข้อความท้ายใบไม่ถูกตัด)
    window.addEventListener('beforeprint', () => { busy = false; apply(); });
    apply();
  })();

  /* ================= 🖨️ หน้าจัดส่งของ LnwShop: ปุ่ม "พิมพ์เรียงร้าน/ขนส่ง" =================
   * ใช้ออเดอร์ที่แสดงอยู่ในหน้า (ตามตัวกรองที่เลือกไว้ เช่น ยังไม่เคยพิมพ์ + รอจัดส่ง) เรียงตาม ร้าน → ขนส่ง → เลขออเดอร์
   * แล้วเปิดหน้าพิมพ์ของ LnwShop ตามลำดับนั้น (ใบปะหน้าและใบจัดของออกมาลำดับเดียวกัน) · ไม่กดพิมพ์ ไม่เปลี่ยนสถานะออเดอร์ */
  const LNW_PRINT_SHOPS = [                                    // ลำดับร้าน (ช่องทาง + ชื่อร้านใน LnwShop ไม่สนตัวพิมพ์เล็ก/ใหญ่)
    { channel: 'lazada', shop: 'kengamp2555', label: 'Lazada KengAmp2555' },
    { channel: 'shopee', shop: 'kengamp', label: 'Shopee KENGAMP' },
    { channel: 'shopee', shop: 'kengamp2555', label: 'Shopee KENGAMP2555' }
  ];
  const LNW_PRINT_SHIP = [/SPX/i, /Flash/i];                   // ลำดับขนส่งในแต่ละร้าน (ที่เหลือต่อท้าย)
  (function lnwPrintSorted() {
    if (location.hostname !== 'a.lnwstore.com' || !/^\/[^/]+\/shipping\/?$/.test(location.pathname)) return;
    const store = () => { for (const e of document.querySelectorAll('*')) { const v = e.__vue__; if (v && v.$store && v.$store.state && v.$store.state.orders) return v.$store.state; } return null; };
    const b = document.createElement('button');
    b.textContent = '🖨️ พิมพ์เรียงร้าน/ขนส่ง';
    b.title = 'เปิดหน้าพิมพ์ของออเดอร์ที่แสดงอยู่ เรียง Lazada → Shopee KENGAMP → Shopee KENGAMP2555 และในแต่ละร้าน SPX ก่อน Flash';
    b.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99999;padding:12px 18px;border:0;border-radius:12px;background:#1b7a4b;color:#fff;font:700 15px/1.2 system-ui,sans-serif;box-shadow:0 3px 10px rgba(0,0,0,.25);cursor:pointer';
    const slug = location.pathname.split('/')[1], GO_KEY = 'pcPrintSortedGo';
    const filtered = () => { const q = new URLSearchParams(location.search); return q.get('sheet') === 'not' && q.get('state') === 'wait_send'; };
    const goFiltered = () => { try { sessionStorage.setItem(GO_KEY, String(Date.now())); } catch (e) { } location.href = '/' + slug + '/shipping?sheet=not&state=wait_send'; };
    b.onclick = () => {
      if (!filtered()) { b.textContent = '⏳ กำลังกรอง "ยังไม่เคยพิมพ์ + รอจัดส่ง"…'; goFiltered(); return; }   // ยังไม่ได้กรอง → กรองให้เอง แล้วทำต่ออัตโนมัติ
      const st = store(); if (!st) { alert('ยังอ่านรายการออเดอร์ในหน้านี้ไม่ได้ – รอหน้าโหลดเสร็จแล้วกดใหม่'); return; }
      const all = Object.values(st.orders || {}).filter(o => o && o.id && o.stage === 'wait_send');
      if (!all.length) { alert('ไม่มีออเดอร์ที่ "ยังไม่เคยพิมพ์" และ "รอจัดส่ง" ตอนนี้'); return; }
      const shopRank = o => { const ch = String(o.channel || '').toLowerCase(), sh = String((o.channel_data && o.channel_data.shop_name) || '').toLowerCase();
        const i = LNW_PRINT_SHOPS.findIndex(x => x.channel === ch && x.shop === sh); return i < 0 ? LNW_PRINT_SHOPS.length : i; };
      const shipRank = o => { const i = LNW_PRINT_SHIP.findIndex(re => re.test(o.shipping_type_text || '')); return i < 0 ? LNW_PRINT_SHIP.length : i; };
      const list = all.slice().sort((a, b) => shopRank(a) - shopRank(b) || shipRank(a) - shipRank(b) || Number(a.id) - Number(b.id));
      const sum = {}; list.forEach(o => { const s = (LNW_PRINT_SHOPS[shopRank(o)] || { label: (o.channel || '?') + ' ' + ((o.channel_data && o.channel_data.shop_name) || '') }).label, k = s + ' · ' + (String(o.shipping_type_text || '-').replace(/^Pickup:\s*/i, '').split(',')[0]); sum[k] = (sum[k] || 0) + 1; });
      const total = Number(st.orders_num) || 0, more = total > all.length ? '\n\n⚠️ หน้านี้โหลดไว้ ' + Object.keys(st.orders || {}).length + ' จาก ' + total + ' ออเดอร์ – เพิ่มจำนวนต่อหน้าก่อน ถ้าอยากพิมพ์ครบ' : '';
      if (!confirm('พิมพ์ ' + list.length + ' ออเดอร์ (ยังไม่เคยพิมพ์ + รอจัดส่ง) เรียงตามนี้:\n\n' + Object.keys(sum).map(k => '• ' + k + ' — ' + sum[k]).join('\n') + more)) return;
      const url = '/' + slug + '/shipping/prepare_print_sheet?oids=' + list.map(o => o.id).join('-');
      const w = window.open(url, '_blank'); if (!w) location.href = url;   // เปิดแท็บใหม่ไม่ได้ (บล็อกป๊อปอัป ตอนทำต่ออัตโนมัติ) → เปิดในแท็บนี้แทน
    };
    // มาจากการกดปุ่มตอนยังไม่กรอง → รอรายการโหลดเสร็จ แล้วทำต่อให้เอง
    (async () => {
      let go = 0; try { go = +sessionStorage.getItem(GO_KEY) || 0; sessionStorage.removeItem(GO_KEY); } catch (e) { }
      if (!go || Date.now() - go > 60000 || !filtered()) return;
      b.textContent = '⏳ กำลังโหลดออเดอร์ที่ยังไม่เคยพิมพ์…';
      let st = null, stable = 0, last = -1;
      for (let i = 0; i < 60; i++) {                          // ≤ 30 วินาที: รอให้จำนวนออเดอร์นิ่ง 2 รอบติด
        await new Promise(r => setTimeout(r, 500));
        st = store(); if (!st || st.now_xhr) { stable = 0; continue; }
        const n = Object.keys(st.orders || {}).length + '|' + st.orders_num;
        stable = n === last ? stable + 1 : 0; last = n; if (stable >= 2 && i >= 4 && (Object.keys(st.orders || {}).length || i >= 12)) break;   // รายการว่างรอนานหน่อย (หน้าอาจยังไม่เริ่มโหลด)
      }
      b.textContent = '🖨️ พิมพ์เรียงร้าน/ขนส่ง';
      b.onclick();
    })();
    const add = () => { if (!document.body.contains(b)) document.body.appendChild(b); };
    add(); setInterval(add, 3000);
  })();

  /* ---------------- เปิดมาจากลิงก์ #pcauto=ร้าน (รองรับแบบเดิม) ---------------- */
  const m = location.hash.match(/pcauto=([^&]+)/);
  if (m) { sessionStorage.setItem('pcauto', decodeURIComponent(m[1])); history.replaceState(null, '', location.pathname + location.search); }

  /* ---------------- เริ่มทำงาน: รู้จักร้านของแท็บนี้ แล้วคอยรับคำขอจากแอป ---------------- */
  (async function main() {
    for (let i = 0; i < 90 && !(onPage() && document.querySelector('.shopee-export-button button.export')); i++) await sleep(1000);
    if (!onPage()) return;

    const linkShop = sessionStorage.getItem('pcauto');
    if (linkShop) { sessionStorage.removeItem('pcauto'); await run(linkShop, 'link'); }

    try {
      myAccount = await getAccount();
      myShop = myAccount ? await shopOf(myAccount, false) : '';
    } catch (e) { /* ยังไม่ได้ตั้งค่า */ }

    // เปิดหน้า (เช่น เปิด Chrome) → ดึงเองทันที ถ้ายังไม่ได้ดึงในช่วง AUTO_SKIP_HOURS
    if (AUTO_ON_OPEN && myShop && !linkShop) {
      const last = +sget('lastOk_' + myShop.toLowerCase(), 0);
      if (Date.now() - last > AUTO_SKIP_HOURS * 3600e3) {
        label.textContent = '⚡ เปิดหน้าแล้ว – ดึงไฟล์ร้าน ' + myShop + ' อัตโนมัติ…';
        await sleep(1500);
        await run(myShop, 'open');
      } else {
        label.textContent = '🟢 ร้าน ' + myShop + ' ดึงไปแล้วเมื่อ ' + new Date(last).toTimeString().slice(0, 5) + ' • พร้อมรับคำขอจากแอป';
      }
    }
    if (!label.textContent.match(/^[✅❌↪🟢]/)) {
      label.textContent = myShop
        ? '🟢 แท็บร้าน ' + myShop + ' พร้อมรับคำขอจากแอป (เช็กทุก ' + POLL_SEC + ' วิ) • หรือกดปุ่มด้านล่าง'
        : '⚪ กดปุ่มด้านล่าง 1 ครั้งเพื่อตั้งค่า แล้วแท็บนี้จะรับคำขอจากแอปได้';
    }

    for (;;) {                                                  // คอยรับคำขอ
      await sleep(POLL_SEC * 1000);
      if (!onPage() || running || !myShop) continue;
      try {
        const r = await api('shopeePoll', { shop: myShop, account: myAccount }, true);
        if (r.job) {
          label.textContent = '📥 ได้รับคำขอจากแอป – เริ่มทำงาน…';
          await run(myShop, 'queue');
        }
        if (!shared) await loadShared();
        if (r.tmVer && verNewer(r.tmVer, GM_info.script.version) && !running && !tsRunning && !incRunning) {   // มีสคริปต์ใหม่บน GitHub → รีเฟรชแท็บให้โหลดตัวใหม่
          const last = JSON.parse(GM_getValue('reloadFor', '{}') || '{}');
          if (last.v !== r.tmVer || Date.now() - last.at > 2 * 3600e3) {              // กันรีเฟรชวน (Tampermonkey อาจยังไม่ได้อัปเดตตัวในเครื่อง)
            GM_setValue('reloadFor', JSON.stringify({ v: r.tmVer, at: Date.now() }));
            label.textContent = '🔄 มีสคริปต์เวอร์ชัน ' + r.tmVer + ' – รีเฟรชแท็บ…';
            await sleep(3000); location.reload(); return;
          }
        }
        if (r.toship) await syncToShip(myShop, 'กด 🔄 ในแอป');
        else if (toShipDue(myShop, r.auto)) {
          await syncToShip(myShop, 'auto');
          const ev = Math.max(30, Number(r.auto && r.auto.every) || 60);                  // รับของตีกลับ: ดึงตามรอบ ⏱ แต่ไม่ถี่กว่า 30 นาที
          if (!running && Date.now() - +sget('lastOk_' + myShop.toLowerCase(), 0) > ev * 60000 - 30000) await run(myShop, 'auto');
        }
      } catch (e) { /* เน็ตหลุดชั่วคราว รอบหน้าค่อยลองใหม่ */ }
    }
  })();
})();
