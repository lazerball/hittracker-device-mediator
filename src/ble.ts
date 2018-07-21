import * as _ from 'lodash';
import * as noble from 'noble';
import * as util from 'util';
import { logger } from './logging';
import * as hdmUtil from './util';

import { Service } from 'typedi';

const GAME_SERVICE_UUID = 'a800';
const GAME_SERVICE_GAME_STATUS_CHAR_UUID = 'a801';
const GAME_SERVICE_LED_CONFIGURE_CHAR_UUID = 'a803';

let scanWhileConnecting = false;

type DeviceMap = Map<string, HitTrackerDevice>;

export enum GameTypes {
  BLINK,
  HP,
}
export enum LedColorPattern {
  SOLID,
  CHASE_FORWARD,
  CHASE_BACKWARD,
  CHASE_INWARD,
  CHASE_THEATER,
  CHASE_THEATER_RAINBOW, // ignores color
  RAINBOW, // ignores color
}

export interface ILedColor {
  red: number;
  green: number;
  blue: number;
}

export interface ILedConfig {
  pattern: LedColorPattern;
  color: ILedColor;
  timePerPixel: number;
  hitPattern: LedColorPattern;
  hitColor: ILedColor;
  hitBlinkTime: number;
  hitTimePerPixel: number;
}
export interface ILedZonesConfig {
  zones: ILedConfig[];
  gameType: GameTypes;
}

interface IGameConfig {
  gameType: GameTypes;
  lowHp: number;
  mediumHP: number;
  fullHP: number;
  ledConfigs: ILedZonesConfig;
}

export class HitTrackerDevice {
  public txPowerLevel = 0;
  public batteryLevel = 100;

  public active = false;
  public lastSeen: number;
  private peripheral: noble.Peripheral;

  private zoneHits: number[] = [0, 0, 0];

  constructor(peripheral: noble.Peripheral) {
    this.peripheral = peripheral;
    this.txPowerLevel = this.peripheral.advertisement.txPowerLevel;
    this.lastSeen = Date.now();
  }

  public async setLedConfiguration(ledConfig: ILedZonesConfig) {
    logger.info(`Connecting to peripheral: ${this.peripheral.address}`);

    await this.connect();
    const { services, characteristics } = await this.peripheral.discoverSomeServicesAndCharacteristics(
      [GAME_SERVICE_UUID],
      [GAME_SERVICE_LED_CONFIGURE_CHAR_UUID]
    );

    const ledConfigCharacteristic = characteristics[0];

    for (const [zone, zoneLedConfig] of Object.entries(ledConfig.zones)) {
      const ledConfigBuffer = Buffer.alloc(16);
      ledConfigBuffer.writeUInt8(ledConfig.gameType, 0);
      ledConfigBuffer.writeUInt8(parseInt(zone, 10), 1);
      ledConfigBuffer.writeUInt8(zoneLedConfig.pattern, 2);
      ledConfigBuffer.writeUInt8(zoneLedConfig.color.red, 3);
      ledConfigBuffer.writeUInt8(zoneLedConfig.color.green, 4);
      ledConfigBuffer.writeUInt8(zoneLedConfig.color.blue, 5);
      ledConfigBuffer.writeUInt16LE(zoneLedConfig.timePerPixel, 6);
      ledConfigBuffer.writeUInt8(zoneLedConfig.hitPattern, 8);
      ledConfigBuffer.writeUInt8(zoneLedConfig.hitColor.red, 9);
      ledConfigBuffer.writeUInt8(zoneLedConfig.hitColor.green, 10);
      ledConfigBuffer.writeUInt8(zoneLedConfig.hitColor.blue, 11);
      ledConfigBuffer.writeUInt16LE(zoneLedConfig.hitBlinkTime, 12);
      ledConfigBuffer.writeUInt16LE(zoneLedConfig.hitTimePerPixel, 14);

      await ledConfigCharacteristic.write(ledConfigBuffer, false);

      logger.info(`setting led configuration to ${ledConfigBuffer.toString('hex')} for ${zone}`);
    }

    await this.disconnect();
    logger.info(`finished setting led configuration for ${this.peripheral.address}`);
  }

  public async setGameStatus(gameStatus: number) {
    logger.info(`Connecting to peripheral: ${this.peripheral.address}`);

    await this.connect();

    const { services, characteristics } = await this.peripheral.discoverSomeServicesAndCharacteristics(
      [GAME_SERVICE_UUID],
      [GAME_SERVICE_GAME_STATUS_CHAR_UUID]
    );
    logger.info(`discovered game service: ${services[0].uuid}`);
    const gameStatusCharacteristic = characteristics[0];

    const gameStatusBuffer = Buffer.alloc(1);
    gameStatusBuffer.writeUInt8(gameStatus, 0);

    await gameStatusCharacteristic.write(gameStatusBuffer, false);
    logger.info(`toggle gameStatus to ${gameStatus}`);
    await this.disconnect();

    logger.info(`finished toggling for ${this.peripheral.address}`);
  }

  public hitData(): number[] {
    return this.zoneHits;
  }

  public parseAdvertisement() {
    const manufacturerData = this.peripheral.advertisement.manufacturerData;

    // sometimes manufacturerData is in fact not defined even though the type says so
    // tslint:disable-next-line: strict-type-predicates
    if (manufacturerData === undefined) {
      logger.error(`[${this.peripheral.address}] Couldn't find manufacturerData`);
      return;
    }
    this.active = !!manufacturerData.readUInt8(0);
    this.batteryLevel = manufacturerData.readUInt8(1);

    this.zoneHits[0] = manufacturerData.readUInt16LE(2);
    this.zoneHits[1] = manufacturerData.readUInt16LE(4);
    this.zoneHits[2] = manufacturerData.readUInt16LE(6);
  }

  private async connect() {
    return this.peripheral.connect();
    logger.info(`Connected to peripheral: ${this.peripheral.address}`);
  }
  private async disconnect() {
    return this.peripheral.disconnect();
    logger.info(`Disconnected from ${this.peripheral.address}`);
  }
}

@Service()
export class HitTrackerDeviceManager {
  private allowDuplicates = true;
  private comparisonData: Map<string, number[]> = new Map<string, number[]>();
  private scanTimeOut: number;
  private seenPeripherals: DeviceMap = new Map<string, HitTrackerDevice>();
  private baseUrl: string;

  constructor(baseUrl: string, scanTimeOut: number = 5000, allowDuplicates = true) {
    this.baseUrl = baseUrl;
    this.allowDuplicates = allowDuplicates;
    this.scanTimeOut = scanTimeOut;

    setInterval(this.restartScanning.bind(this), 600000);
    setInterval(this.removeMissingDevices.bind(this), 2000);
  }

  public resetComparisonData(address: string) {
    if (!this.comparisonData.has(address)) {
      this.comparisonData.set(address, [0, 0, 0]);
    }
  }

  public setupNoble() {
    logger.info('Setting up Noble');
    noble.on('stateChange', async state => {
      logger.info(`State Changed to: ${state}`);
      if (state === 'poweredOn') {
        await this.startScanning().catch(logger.error);
      } else {
        await this.stopScanning();
      }
    });

    noble.on('discover', this.discoverPeripherals.bind(this));
    noble.on('warning', (warning: string) => {
      logger.warn(`NOBLE WARNING: ${warning}`);
    });
  }

  public async startScanning() {
    logger.info('Start Scan');
    try {
      await noble.startScanning([GAME_SERVICE_UUID], this.allowDuplicates);
    } catch (e) {
      logger.error(e);
    }
  }

  public async stopScanning() {
    logger.info('Stop Scan');
    try {
      await noble.stopScanning();
    } catch (e) {
      logger.error(e);
    }
  }
  public addresses() {
    return Array.from(this.seenPeripherals.keys());
  }

  public hasDevice(address: string): boolean {
    return this.addresses().includes(address);
  }

  public getDevice(address: string): HitTrackerDevice {
    return this.seenPeripherals.get(address)!;
  }

  public async stopGame(gameConfiguration: hdmUtil.GameConfiguration) {
    await this.stopScanning();
    const stopPeripherals = this.addresses() ? gameConfiguration.radioIds : [];
    logger.info(`Stopping game for peripherals: ${JSON.stringify(stopPeripherals)}`);
    stopPeripherals.forEach(async address => {
      this.resetComparisonData(address);
      if (this.hasDevice(address)) {
        try {
          await this.getDevice(address).setGameStatus(0);
        } catch (error) {
          logger.error(`Failed to stop game because: ${error}`);
        }
      }
    });
    await hdmUtil.setTimeOutAsync(this.scanTimeOut);
    await this.startScanning();
  }

  public async startGame(gameConfiguration: hdmUtil.GameConfiguration) {
    logger.info('Starting Game');
    await this.stopScanning();
    const ourPeripherals = hdmUtil.intersection(this.addresses(), gameConfiguration.radioIds);

    const chunkedPeripheralAddresses = _.chunk(ourPeripherals, 3);
    for (const peripheralAddressGroup of chunkedPeripheralAddresses) {
      const promiseGroup = [];
      for (const address of peripheralAddressGroup) {
        if (this.hasDevice(address)) {
          promiseGroup.push(this.getDevice(address).setGameStatus(1));
        }
      }
      await Promise.resolve(promiseGroup);
    }

    await hdmUtil.setTimeOutAsync(this.scanTimeOut);
    await this.startScanning();
  }

  private discoverPeripherals(peripheral: noble.Peripheral) {
    const localName = peripheral.advertisement.localName;
    const address = peripheral.address;

    let device;
    if (!this.hasDevice(address)) {
      device = new HitTrackerDevice(peripheral);
      this.seenPeripherals.set(address, device);
      this.resetComparisonData(address);
      logger.debug(`[${address}] NAME: ${localName.trimRight()}`);
    } else {
      device = this.getDevice(address);
      device.lastSeen = Date.now();
      logger.debug(`[${address}] RSSI ${peripheral.rssi} GAME ACTIVE: ${device.active}`);
    }
    device.parseAdvertisement();

    const zoneHits = device.hitData();

    logger.debug(`[${address}] DATA: ${JSON.stringify(zoneHits)}`);
    for (let zone = 0; zone < zoneHits.length; zone++) {
      if (this.comparisonData.get(address)![zone] < zoneHits[zone]) {
        hdmUtil.sendRequest(this.baseUrl, address, zone + 1).catch(logger.error);
      }
    }

    this.comparisonData.set(address, zoneHits);
  }

  private removeMissingDevices() {
    for (const [address, device] of this.seenPeripherals) {
      if (Date.now() - device.lastSeen > 600000) {
        logger.debug(`[${address}] went away`);
        this.seenPeripherals.delete(address);
      }
    }
  }
  private async restartScanning() {
    logger.debug('Restart Scanning');

    await this.stopScanning();
    await this.startScanning();
  }
}
