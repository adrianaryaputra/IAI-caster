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


modbus_run();
plc_updateAI();
plc_updateDI();