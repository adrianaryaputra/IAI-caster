const cfg = require('./config.json');
const deviceName = require('os').hostname();

// mqtt import
const mqtt = require('mqtt');
const mqclient = mqtt.connect(cfg.MQTT_BROKER, {port:cfg.MQTT_PORT, clientId: deviceName});

function mq_publish(command, payload) {
    console.log(`publishing ${command} : ${payload}`);
    const ps = JSON.stringify({
        payload: payload
    });
    const topic = ["CASTER", deviceName, command].join('/');
    mqclient.publish(topic, ps, {qos: 2});
    console.log(`MQTT send ${topic}: ${ps}`);
}

const { 
    ModbusHandler, 
    ModbusDevice_FX3U, 
    SerialPort,
} = require('modbus-mitsubishi-fx3u');

const {
    ModbusDevice_T4RN,
    ModbusDevice_T4RN_address,
} = require('modbus-autonics-tk4s');

let modbusHandler = new ModbusHandler({
    msgSendInterval: cfg.MODBUS_SEND_INTERVAL,
    timeout: cfg.MODBUS_TIMEOUT,
    retryCount: cfg.STATUS_RETRY_COUNT,
});

let plc = new ModbusDevice_FX3U({
    modbusHandler: modbusHandler,
    modbusId: cfg.PLC_ID,
    modbusTimeout: cfg.MODBUS_TIMEOUT,
});

let thermo1 = new ModbusDevice_T4RN({
    modbusHandler: modbusHandler,
    modbusId: cfg.THERMO1_ID,
    modbusTimeout: cfg.MODBUS_TIMEOUT,
});

let thermo2 = new ModbusDevice_T4RN({
    modbusHandler: modbusHandler,
    modbusId: cfg.THERMO2_ID,
    modbusTimeout: cfg.MODBUS_TIMEOUT,
});

let thermo3 = new ModbusDevice_T4RN({
    modbusHandler: modbusHandler,
    modbusId: cfg.THERMO3_ID,
    modbusTimeout: cfg.MODBUS_TIMEOUT,
});

let thermo4 = new ModbusDevice_T4RN({
    modbusHandler: modbusHandler,
    modbusId: cfg.THERMO4_ID,
    modbusTimeout: cfg.MODBUS_TIMEOUT,
});

let thermo5 = new ModbusDevice_T4RN({
    modbusHandler: modbusHandler,
    modbusId: cfg.THERMO5_ID,
    modbusTimeout: cfg.MODBUS_TIMEOUT,
});

let thermo6 = new ModbusDevice_T4RN({
    modbusHandler: modbusHandler,
    modbusId: cfg.THERMO6_ID,
    modbusTimeout: cfg.MODBUS_TIMEOUT,
});

async function modbus_run() {
    try {
        modbusRunning = true;
        console.log("connecting to modbus ...");
        let serialList = (await SerialPort.list()).filter(s => s.manufacturer === cfg.MODBUS_SERIALNAME);
        if(serialList.length == 1) {
            let modbusPort = new SerialPort(serialList[0].path, {autoOpen: false, baudRate: cfg.MODBUS_BAUD, stopBits: cfg.MODBUS_STOPBIT});
            modbusHandler.setConnection(modbusPort).open(() => {
                console.log("modbus port open");
            });
        }
        else throw Error(`there are ${serialList.length} serial selected, it should be 1.`)
    } catch(e) {
        modbus_handleError(e);
        modbus_handleError(Error('Port Not Open'));
    }
}

function plc_updateAI(){
    setTimeout( () => {
        plc.read({
            type: plc.type.D,
            address: 0,
            length: 6,
            priority: 1,
            callback: (e,s) => {
                if(e) console.error(e)
                if(s) {
                    mq_publish("AI", s);
                    console.log(`read ${s} success`);
                }
                plc_updateAI();
            }
        })
    }, cfg.PLC_UPDATE_INTERVAL)   
}


function plc_updateDI(){
    setTimeout( () => {
        plc.read({
            type: plc.type.M,
            address: 0,
            length: 2,
            priority: 1,
            callback: (e,s) => {
                if(e) modbus_handleError(e)
                if(s) {
                    mq_publish("DI", s);
                    console.log(`read ${s} success`);
                }
                plc_updateDI();
            }
        })
    }, cfg.PLC_UPDATE_INTERVAL)   
}


function modbus_handleError(e){
    console.error(e);
    mq_publish("MODBUS_ERROR", e.message)

    if(e.message === 'Port Not Open') setTimeout(modbus_run, 1000);
}

let thermoList = [thermo1, thermo2, thermo3, thermo4, thermo5, thermo6];
let thermoTemp = thermoList.map(() => -1);

function thermo_update() {
    thermoList.forEach((thermo, id) => {
        thermo.get({
            address: thermo.address.presentValue,
            priority: 1,
            callback: (e,s) => {
                if(e) {
                    console.log(e);
                    modbus_handleError(e);
                    thermoTemp[id] = -1;
                };
                if(s) {
                    thermoTemp[id] = s;
                    console.log("temp :", thermoTemp);
                };
            }
        })
    });
    mq_publish("TEMP", thermoTemp);
    setTimeout(() => thermo_update(), cfg.THERMO_UPDATE_INTERVAL);
}


modbus_run();

plc_updateAI();
plc_updateDI();

thermo_update();