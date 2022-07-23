var nextTransactionId = 0;
var lastTransactionId = -1;

var lastDataStartAdress = 0;
var lastDataCount = 0;

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

function dataReceived(data){
    script.log("Modbus message received:");
    if(data[2] != 0 || data[3] != 0){
        script.log("Incorect protocol type");
        return;
    }
    //var length = (data[4] << 8) + data[5];

    if(data[7] == 0x01){ // read coils
        readBinaryInputs(data, "coils", "Coils", "Coil", "coil");
    }else if(data[7] == 0x02){ // read inputs
        readBinaryInputs(data, "discreteInputs", "Discrete inputs", "Input", "input");
    }else if(data[7] == 0x03){
        readRegisterInput(data, "holdingRegisters", "Holding registers", "Register", "register");
    }else if(data[7] == 0x04){
        readRegisterInput(data, "inputRegisters", "Input registers", "Register", "register");
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
