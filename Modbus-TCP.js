var nextTransactionId = 0;
var lastTransactionId = -1;

var lastDataStartAdress = 0;
var lastDataCount = 0;

var lastRequestedFile = 0;
var lastRequestedRecord = 0;
var lastRequestedFileLenght = 0;

var errorMessages = [
    "UNKNOWN",
    "ILLEGAL FUNCTION",
    "ILLEGAL DATA ADDRESS",
    "ILLEGAL DATA VALUE",
    "SERVER DEVICE FAILURE",
    "ACKNOWLEDGE",
    "SERVER DEVICE BUSY",
    "MEMORY PARITY ERROR",
    "GATEWAY PATH UNAVAILABLE",
    "GATEWAY TARGET DEVICE FAILED TO RESPOND"
];

function moduleParameterChanged(param){
    if(param.is(local.parameters.clearValues)){
        for(var i=0; i<255; i+=1){
            local.values.removeContainer("device"+i);
        }
    }
}

function getDeviceContainer(deviceId){
    var device = local.values.getChild("device" + deviceId);
    if(device == null){
        device = local.values.addContainer("Device " + deviceId);
    }
    return device;
}

function getDeviceCategory(device, categoryName, categoryId){
    var category = device.getChild(categoryId);
    if(category == null){
        category = device.addContainer(categoryName);
    }
    return category;
}

function checkTransactionId(data){
    var trId = (data[0] << 8) + data[1];
    if(lastTransactionId != trId){
        script.log("Invalid transaction id");
        return false;
    }
    return true;
}

function readBinaryInputs(data, categoryId, categoryName, name, nameId){
    script.log("Type: read "+categoryId);
    var returnedBytes = data[8];

    if(returnedBytes * 8<lastDataCount){
        script.log("Incorrect number of returned "+categoryId);
        return;
    }

    if(!checkTransactionId(data)) return;

    var device = getDeviceContainer(data[6]);
    var category = getDeviceCategory(device,categoryName,categoryId);

    for(var i=0; i<lastDataCount; i+=1){
        var inputId = lastDataStartAdress + i;
        var valueP = category.getChild(nameId+inputId);
        if(valueP == null){
            valueP = category.addBoolParameter(name+" "+inputId, name+" state n#"+inputId, false);
        }
        var bitId = (i%8);
        var byteId = (i - bitId) / 8 + 9;

        valueP.set((data[byteId] >> bitId) & 0x01 == 1);
    }
}

function readRegisterInput(data, categoryId, categoryName, name, nameId){
    script.log("Type: read "+categoryId);
    var returnedBytes = data[8];

    if(returnedBytes<lastDataCount*2){
        script.log("Incorrect number of returned "+categoryId);
        return;
    }

    if(!checkTransactionId(data)) return;

    var device = getDeviceContainer(data[6]);
    var category = getDeviceCategory(device,categoryName,categoryId);

    for(var i=0; i<lastDataCount; i+=1){
        var inputId = lastDataStartAdress + i;
        var valueP = category.getChild(nameId+inputId);
        if(valueP == null){
            valueP = category.addIntParameter(name+" "+inputId, name+" n#"+inputId, 0, 0, 65535);
        }
        
        var byteId = (i*2)+9;
        valueP.set((data[byteId] << 8) + data[byteId+1]);
    }
}

function readFileInput(data){
    if(data[10] != 0x06){
        script.log("Incorrect header for file");
        return;
    }
    if(!checkTransactionId(data)) return;

    var device = getDeviceContainer(data[6]);
    var category = getDeviceCategory(device,"Files","files");
    var subcat = getDeviceCategory(category,"File "+lastRequestedFile,"file"+lastRequestedFile);

    for(var i=0; i<lastRequestedFileLenght; i+=1){
        var recordId = lastRequestedRecord+i;
        var valueP = subcat.getChild("rec"+recordId);
        if(valueP == null){
            valueP = subcat.addIntParameter("Rec "+recordId, "Record n#"+recordId, 0, 0, 65535);
        }
        valueP.set(data[11+i]);
    }
}

function dataReceived(data){
    script.log("Modbus message received:");
    if(data[2] != 0 || data[3] != 0){
        script.log("Incorect protocol type");
        return;
    }
    //var length = (data[4] << 8) + data[5];

    var cmd = data[7];

    if(cmd == 0x01){ // read coils
        readBinaryInputs(data, "coils", "Coils", "Coil", "coil");
    }else if(cmd == 0x02){ // read inputs
        readBinaryInputs(data, "discreteInputs", "Discrete inputs", "Input", "input");
    }else if(cmd == 0x03){
        readRegisterInput(data, "holdingRegisters", "Holding registers", "Register", "register");
    }else if(cmd == 0x04){
        readRegisterInput(data, "inputRegisters", "Input registers", "Register", "register");
    }else if(cmd == 0x14){ // Read File Record
        readFileInput(data);
    }else if(cmd > 0x80){
        local.values.latestError.latestInvalidCommand.set(cmd - 0x80);
        var errorCode = data[8];
        local.values.latestError.latestErrorCode.set(errorCode);
        local.values.latestError.latestErrorMessage.set(errorMessages[errorCode]);
        local.values.latestError.error.trigger();
    }
}

function sendModbusMessage(device,messageType,data,dataLength){
    lastTransactionId = nextTransactionId;
    nextTransactionId += 1;
    if(nextTransactionId > 65535){
        nextTransactionId = 0;
    }

    var totalLenght = dataLength + 2;

    script.log(data[3]);
    local.sendBytes(
        lastTransactionId >> 8,
        lastTransactionId & 255,
        0x00,
        0x00,
        totalLenght >> 8,
        totalLenght & 255,
        device,
        messageType,
        data
    );
}

function readData(type, address, startAdress, readCount){
    lastDataStartAdress = startAdress;
    lastDataCount = readCount;
    sendModbusMessage(
        address,
        type,
        [
            startAdress >> 8,
            startAdress & 255,
            readCount >> 8,
            readCount & 255
        ],
        4
    );
}

function writeCoil(address, coilAddress, value){
    var dataH = 0;
    if(value){
        dataH = 0xFF;
    }

    sendModbusMessage(
        address,
        0x05,
        [
            coilAddress >> 8,
            coilAddress & 255,
            dataH,
            0
        ],
        4
    );
}

function writeRegister(address, registerAddress, value){
    sendModbusMessage(
        address,
        0x06,
        [
            registerAddress >> 8,
            registerAddress & 255,
            value >> 8,
            value & 255
        ],
        4
    );
}

function readFileRecord(address, file, record, recordCnt){
    lastRequestedFile = file;
    lastRequestedRecord = record;
    lastRequestedFileLenght = recordCnt;

    sendModbusMessage(
        address,
        0x14,
        [
            0x07,
            0x06,
            file >> 8,
            file & 255,
            record >> 8,
            record & 255,
            recordCnt >> 8,
            recordCnt & 255
        ],
        8
    );
}

function writeFileRecord(address, file, record, value){
    sendModbusMessage(
        address,
        0x15,
        [
            0x09,
            0x06,
            file >> 8,
            file & 255,
            record >> 8,
            record & 255,
            0x00,
            0x01,
            value >> 8,
            value & 255,
        ],
        10
    );
}
