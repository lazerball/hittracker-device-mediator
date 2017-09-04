import * as _ from 'lodash';
import * as noble from 'noble';
import { logger } from './logging';
import * as util from './util';

const GAME_SERVICE_UUID = 'a800';
const GAME_SERVICE_GAME_STATUS_CHAR_UUID = 'a801';

const seenPeripherals = {} as any;
const valuesToSend = {} as any;
const stopScanningTimeOut = 10000;
const startScanningTimeOut = 20000;
let activePeripherals = [] as string[];
let webAppUrl = '';

export const setHitUrlBase = (urlBase: string) => {
  webAppUrl = urlBase;
};

export const startScanning = () => {
  logger.info('Start Scan');
  noble.startScanning([GAME_SERVICE_UUID], true /* allowDuplicates*/);
};

export const stopScanning = () => {
  logger.info('Stop Scan');
  noble.stopScanning();
};

export const setupNoble = async () => {
  logger.info('Setting up Noble');
  noble.on('stateChange', state => {
    logger.info(`State Changed to: ${state}`);
    if (state === 'poweredOn') {
      startScanning();
    } else {
      stopScanning();
    }
  });

  noble.on('discover', discoverPeripherals);
  noble.on('warning', (warning: string) => {
    logger.warn(`NOBLE WARNING: ${warning}`);
  });
};

const setPeripheralGameStatus = async (peripheral: noble.Peripheral, gameStatus: number) => {
  logger.info(`Connecting to peripheral: ${peripheral.address}`);

  peripheral.connect(error => {
    if (error) {
      logger.error(`Couldn't connect to peripheral because: ${error}`);
    }
    logger.info(`Connected to peripheral: ${peripheral.address}`);
    peripheral.discoverSomeServicesAndCharacteristics(
      [GAME_SERVICE_UUID],
      [GAME_SERVICE_GAME_STATUS_CHAR_UUID],
      async (discoverError, services, characteristics) => {
        if (discoverError) {
          logger.error(`Failed to discover characteristic because: ${error}`);
        }
        logger.info(`discovered game service: ${services[0].uuid}`);

        const gameStatusCharacteristic = characteristics[0];
        const gameStatusBuffer = new Buffer(1);

        gameStatusBuffer.writeUInt8(gameStatus, 0);
        gameStatusCharacteristic.write(gameStatusBuffer, false, writeError => {
          logger.info(`toggle gameStatus to ${gameStatus}`);
          if (error) {
            logger.error(`Couldn't toggle gameStatus because: ${error}`);
          }
          peripheral.disconnect(() => {
            logger.info(`Disconnected from ${peripheral.address}`);
          });
        });

        logger.info(`finished toggling for ${peripheral.address}`);
      }
    );
  });
};

export const stopGame = async (gameConfiguration: util.GameConfiguration) => {
  stopScanning();
  const stopPeripherals = activePeripherals ? gameConfiguration.radioIds : [];
  logger.info(`Stopping game for peripherals: ${JSON.stringify(stopPeripherals)}`);
  stopPeripherals.forEach(async address => {
    if (seenPeripherals.hasOwnProperty(address)) {
      try {
        await setPeripheralValue(address, 0);
      } catch (error) {
        logger.error(`Failed to stop game because: ${error}`);
      }
    }
  });
  setTimeout(() => {
    startScanning();
  }, startScanningTimeOut);

  activePeripherals = [];
};

export const startGame = async (gameConfiguration: util.GameConfiguration) => {
  logger.info('Starting Game');
  stopScanning();
  const ourPeripherals = util.intersection(Object.keys(seenPeripherals), gameConfiguration.radioIds);

  const chunkedPeripheralAddresses = _.chunk(ourPeripherals, 3);
  for (const peripheralAddressGroup of chunkedPeripheralAddresses) {
    const promiseGroup = [];
    for (const address of peripheralAddressGroup) {
        promiseGroup.push(setPeripheralValue(address, 1));
    }
    Promise.resolve(promiseGroup);
  }
  setTimeout(() => {
    startScanning();
  }, startScanningTimeOut);
};

export const seenPeripheralAddress = (address: string) => {
  return seenPeripherals.hasOwnProperty(address);
};
export const setPeripheralValue = async (address: string, value: number) => {

  if (!seenPeripheralAddress(address)) {
    logger.warn(`We haven't seen ${address}, so we can't set a value on the peripheral`);
    return;
  }

  const peripheral = seenPeripherals[address];
  await setPeripheralGameStatus(peripheral, value);
  valuesToSend[address] = { zone1: 0, zone2: 0 };
  if (value === 0) {
    _.remove(activePeripherals, removeAddress => removeAddress === address);
  } else {
    activePeripherals.push(address);
  }
};

const discoverPeripherals = (peripheral: noble.Peripheral) => {
  const localName = peripheral.advertisement.localName;
  const address = peripheral.address;

  if (!seenPeripherals[address]) {
    seenPeripherals[address] = peripheral;
    valuesToSend[address] = { zone1: 0, zone2: 0 };
  }
  if (peripheral.advertisement.manufacturerData) {
    const manufacturerData = peripheral.advertisement.manufacturerData;
    const hitSection = manufacturerData.slice(1);
    const data = {
      zone1: hitSection.readUInt16LE(0),
      zone2: hitSection.readUInt16BE(1),
    };

    logger.debug(`[${address}] RSSI ${peripheral.rssi} NAME: ${localName} DATA: ${JSON.stringify(data)}`);
    if (valuesToSend[address].zone1 < data.zone1) {
      util.sendRequest(webAppUrl, address, 1);
    }
    if (valuesToSend[address].zone2 < data.zone2) {
      util.sendRequest(webAppUrl, address, 2);
    }

    valuesToSend[address] = data;
  }
  /*if (peripheral.advertisement.txPowerLevel !== undefined) {
        log('\tmy TX power level is:');
        log(`\t\t'${peripheral.advertisement.txPowerLevel}`);
    }*/
};
