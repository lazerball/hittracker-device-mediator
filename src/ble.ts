import axios from 'axios';
import * as noble from 'noble';
import { logger } from './logging';

const GAME_SERVICE_UUID = 'a800';
const GAME_SERVICE_GAME_STATUS_CHAR_UUID = 'a801';

const seenPeripherals = {} as any;
const valuesToSend = {} as any;
let activePeripherals = [] as string[];
let gameActive = false;
let webAppUrl = '';

export class GameConfiguration {
  public radioList: string[];
}

const getHttpInstance = (url: string) => {
  return axios.create({
    baseURL: url,
    headers: {
      Accept: 'application/json;version=0.1',
      'Content-Type': 'application/json',
    },
    timeout: 5000,
  });
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
    logger.warn(warning);
  });
};

const toggleGameStatusCharacteristic = (characteristic: noble.Characteristic, value: number) => {
  const gameStatus = new Buffer(1);
  gameStatus.writeUInt8(value, 0);
  characteristic.write(gameStatus, false, error => {
    logger.info(`toggle gameStatus to ${value}`);
    if (error) {
      logger.error(`Couldn't toggle gameStatus because: ${error}`);
    }
  });
};

const setPeripheralGameStatus = async (peripheral: noble.Peripheral, gameStatus: number) => {
  logger.info(`Connecting to peripheral: ${peripheral.uuid}`);

  stopScanning();
  peripheral.connect(error => {
    if (error) {
      logger.error(error);
    }
    logger.info(`Connected to peripheral: ${peripheral.uuid}`);
    peripheral.discoverSomeServicesAndCharacteristics(
      [GAME_SERVICE_UUID],
      [GAME_SERVICE_GAME_STATUS_CHAR_UUID],
      async (discoverError, services, characteristics) => {
        if (discoverError) {
          logger.error(`Failed to discover characteristic because: ${error}`);
        }
        logger.info(`discovered game service: ${services[0].uuid}`);

        const gameStatusCharacteristic = characteristics[0];
        toggleGameStatusCharacteristic(gameStatusCharacteristic, gameStatus);
        peripheral.disconnect(() => {
          logger.info(`Disconnected from ${peripheral.address}`);
          startScanning();
        });
        logger.info(`finished toggling for ${peripheral.address}`);
      }
    );
  });
};

export const stopGame = async (url: string) => {
  webAppUrl = url
  logger.info(`Stopping game for peripherals: ${JSON.stringify(Object.keys(activePeripherals))}`);
  Object.keys(activePeripherals).forEach(async address => {
    valuesToSend[address] = { zone1: 0, zone2: 0 };
    const peripheral = seenPeripherals[address];
    try {
      await setPeripheralGameStatus(peripheral, 0);
    } catch (error) {
      logger.error(`Failed to stop game because: ${error}`);
    }
  });
  activePeripherals = [];
  gameActive = false;
};

// Intersection (a ∩ b): create a set that contains those elements of set a that are also in set b.
const getActiveGamePeripherals = (knownPeripherals: string[], gamePeripherals: string[]): string[] => {
  const a = new Set(knownPeripherals);
  const b = new Set(gamePeripherals);
  return Array.from(new Set([...a].filter(x => b.has(x))));
};
export const startGame = async (gameConfiguration: GameConfiguration, url: string) => {
  logger.info('Stopping Game');
  webAppUrl = url;
  const ourPeripherals = getActiveGamePeripherals(seenPeripherals, gameConfiguration.radioList);
  Object.keys(ourPeripherals).forEach(async address => {
    valuesToSend[address] = { zone1: 0, zone2: 0 };
    activePeripherals.push(address);
    const peripheral = seenPeripherals[address];

    try {
      await setPeripheralGameStatus(peripheral, 1);
    } catch (error) {
      logger.error(`Failed to start game because: ${error}`);
    }
  });
  gameActive = true;
};

const discoverPeripherals = (peripheral: noble.Peripheral) => {
  const localName = peripheral.advertisement.localName;
  const address = peripheral.address;
  logger.debug(`[${address}] <${peripheral.addressType}> RSSI ${peripheral.rssi} NAME: ${localName}`);

  if (!seenPeripherals[address]) {
    seenPeripherals[address] = peripheral;
    valuesToSend[address] = { zone1: 0, zone2: 0 };
  }
  if (peripheral.advertisement.manufacturerData) {
    const manufacturerData = peripheral.advertisement.manufacturerData;
    const hitSection = manufacturerData.slice(1);
    const data = {
      zone1: hitSection.readUInt16LE(0),
      zone2: hitSection.readUInt16LE(1),
    };
    logger.debug(JSON.stringify(data));
    if (gameActive) {
      if (valuesToSend[address].zone1 < data.zone1) {
        sendRequest(webAppUrl, address, 1);
      }
      if (valuesToSend[address].zone2 < data.zone2) {
        sendRequest(webAppUrl, address, 2);
      }
    }

    valuesToSend[address] = data;
  }
  /*if (peripheral.advertisement.txPowerLevel !== undefined) {
        log('\tmy TX power level is:');
        log(`\t\t'${peripheral.advertisement.txPowerLevel}`);
    }*/
};

const sendRequest = async (url: string, radioId: string, zone: number) => {
  logger.info(`Sending Request for ${radioId}:${zone}`);
  const http = getHttpInstance(url);

  const data = {
    events: [
      {
        event: 'hit',
        radioId,
        zone,
      },
    ],
  };
  try {
    await http.post('/games/hit', JSON.stringify(data));
  } catch (e) {
    logger.error(e);
  }
};
