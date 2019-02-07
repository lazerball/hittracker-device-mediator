import * as _ from 'lodash';
import { Characteristic, Noble, Peripheral } from 'noble';
import { Service } from 'typedi';

import * as util from 'util';
import { ILedZonesConfig } from './interfaces';
import { logger } from './logging';
import * as hdmUtil from './util';

const GAME_SERVICE_UUID = 'a800';
const GAME_SERVICE_GAME_STATUS_CHAR_UUID = 'a801';
const GAME_SERVICE_LED_CONFIGURE_CHAR_UUID = 'a803';

type DeviceMap = Map<string, HitTrackerDevice>;

const noble = new Noble();

export interface DeviceManagerOptions {
  allowDuplicates: boolean;
  scanTimeOut: number;
}

export class HitTrackerDevice {
  public txPowerLevel = 0;
  public batteryLevel = 100;

  public active = false;
  public lastSeen: number;
  public zoneHits: number[];
  private peripheral: Peripheral;

  private lastHit: number[];

  constructor(peripheral: Peripheral, zoneCount = 2) {
    this.peripheral = peripheral;
    this.txPowerLevel = this.peripheral.advertisement.txPowerLevel;
    this.lastSeen = Date.now();
    this.zoneHits = new Array(zoneCount).fill(0);
    this.lastHit = new Array(zoneCount).fill(0);
  }

  public async setLedConfiguration(ledConfig: ILedZonesConfig) {
    logger.info(`Connecting to peripheral: ${this.peripheral.address}`);

    await this.connect();
    const { services, characteristics } = await this.peripheral.discoverSomeServicesAndCharacteristics(
      [GAME_SERVICE_UUID],
      [GAME_SERVICE_LED_CONFIGURE_CHAR_UUID]
    );
    if (!characteristics) return;
    const ledConfigCharacteristic = characteristics[0];

    for (const [zone, zoneLedConfig] of Object.entries(ledConfig.zones)) {
      let ledConfigBuffer;
      if (typeof zoneLedConfig.color.white !== 'undefined' && typeof zoneLedConfig.hitColor.white !== 'undefined') {
        ledConfigBuffer = Buffer.alloc(19);
        ledConfigBuffer.writeUInt8(ledConfig.gameType, 0);
        ledConfigBuffer.writeUInt8(parseInt(zone, 10), 1);
        ledConfigBuffer.writeUInt8(zoneLedConfig.pattern, 2);
        ledConfigBuffer.writeUInt8(zoneLedConfig.color.red, 3);
        ledConfigBuffer.writeUInt8(zoneLedConfig.color.green, 4);
        ledConfigBuffer.writeUInt8(zoneLedConfig.color.blue, 5);
        ledConfigBuffer.writeUInt8(zoneLedConfig.color.white, 6);
        ledConfigBuffer.writeUInt16LE(zoneLedConfig.timePerPixel, 7);
        ledConfigBuffer.writeUInt8(zoneLedConfig.hitPattern, 9);
        ledConfigBuffer.writeUInt8(zoneLedConfig.hitColor.red, 10);
        ledConfigBuffer.writeUInt8(zoneLedConfig.hitColor.green, 11);
        ledConfigBuffer.writeUInt8(zoneLedConfig.hitColor.blue, 12);
        ledConfigBuffer.writeUInt8(zoneLedConfig.hitColor.white, 13);
        ledConfigBuffer.writeUInt16LE(zoneLedConfig.hitBlinkTime, 14);
        ledConfigBuffer.writeUInt16LE(zoneLedConfig.hitTimePerPixel, 16);
      } else {
        ledConfigBuffer = Buffer.alloc(15);
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
      }
      await ledConfigCharacteristic.write(ledConfigBuffer);

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
    if (!services || !characteristics) return;
    logger.info(`discovered game service: ${services[0].uuid}`);
    const gameStatusCharacteristic = characteristics[0];

    const gameStatusBuffer = Buffer.alloc(1);
    gameStatusBuffer.writeUInt8(gameStatus, 0);

    await gameStatusCharacteristic.write(gameStatusBuffer);
    logger.info(`toggle gameStatus to ${gameStatus}`);
    await this.disconnect();
    this.resetZoneHits();

    logger.info(`finished toggling for ${this.peripheral.address}`);
  }

  public zonesHit(): number[] {
    const hits = [];
    for (let zone = 0; zone < this.zoneHits.length; zone++) {
      if (this.zoneHits[zone] > this.lastHit[zone]) {
        hits.push(zone);
      }
    }
    return hits;
  }

  public parseAdvertisement() {
    this.lastHit = this.zoneHits.slice(0);
    const manufacturerData = this.peripheral.advertisement.manufacturerData;

    // sometimes manufacturerData is in fact not defined even though the type says so
    // tslint:disable-next-line: strict-type-predicates
    if (!manufacturerData) {
      logger.error(`[${this.peripheral.address}] Couldn't find manufacturerData`);
      return;
    }
    this.active = !!manufacturerData.readUInt8(0);
    this.batteryLevel = manufacturerData.readUInt8(1);

    this.zoneHits[0] = manufacturerData.readUInt16LE(2);
    this.zoneHits[1] = manufacturerData.readUInt16LE(4);
    this.zoneHits[2] = manufacturerData.readUInt16LE(6);
  }

  private resetZoneHits() {
    this.zoneHits = new Array(this.zoneHits.length).fill(0);
    this.lastHit = new Array(this.lastHit.length).fill(0);
  }

  private isConnected(): boolean {
    const state = this.peripheral.state;

    return state === 'connected' || state === 'connecting';
  }

  private async connect() {
    if (this.isConnected()) {
      return;
    }
    return this.peripheral.connect();
    logger.info(`Connected to peripheral: ${this.peripheral.address}`);
  }
  private async disconnect() {
    if (!this.isConnected()) {
      return;
    }
    return this.peripheral.disconnect();
    logger.info(`Disconnected from ${this.peripheral.address}`);
  }
}

@Service()
export class HitTrackerDeviceManager {
  private options: DeviceManagerOptions;
  private seenPeripherals: DeviceMap = new Map<string, HitTrackerDevice>();
  private baseUrl: string;
  private isScanning = false;

  constructor(baseUrl: string, nobleBindingName: string | null = null, options: Partial<DeviceManagerOptions> = {}) {
    this.baseUrl = baseUrl;

    const defaults = {
      scanTimeOut: 5000,
      allowDuplicates: true,
    };
    this.options = { ...defaults, ...options };

    if (process.platform !== 'win32') {
      setInterval(this.restartScanning.bind(this), 600000);
    }
    setInterval(this.removeMissingDevices.bind(this), 2000);
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

    noble.on('scanStart', () => {
      this.isScanning = true;
    });
    noble.on('scanStop', () => {
      this.isScanning = false;
    });
    noble.on('warning', (warning: string) => {
      logger.warn(`NOBLE WARNING: ${warning}`);
    });
  }

  public async startScanning() {
    if (this.isScanning === true) {
      return;
    }
    logger.info('Start Scan');
    try {
      await noble.startScanning([GAME_SERVICE_UUID], this.options.allowDuplicates);
    } catch (e) {
      logger.error(e);
    }
  }

  public async stopScanning() {
    logger.info('Stop Scan');
    if (this.isScanning === false) {
      return;
    }
    try {
      await noble.stopScanning();
    } catch (e) {
      logger.error(e);
    }
  }
  public allAddresses() {
    return Array.from(this.seenPeripherals.keys());
  }

  public hasDevice(address: string): boolean {
    return this.allAddresses().includes(address);
  }

  public getDevice(address: string): HitTrackerDevice {
    return this.seenPeripherals.get(address)!;
  }

  public async stopGame(gameConfiguration: hdmUtil.GameConfiguration) {
    await this.stopScanning();
    let stopPeripherals = hdmUtil.intersection(this.allAddresses(), gameConfiguration.units.map(unit => unit.radioId));
    if (stopPeripherals.length === 0) {
      stopPeripherals = this.allAddresses();
    }
    logger.info(`Stopping game for peripherals: ${JSON.stringify(stopPeripherals)}`);
    stopPeripherals.forEach(async address => {
      if (this.hasDevice(address)) {
        try {
          await this.getDevice(address).setGameStatus(0);
        } catch (error) {
          logger.error(`Failed to stop game because: ${error}`);
        }
      }
    });
    await hdmUtil.setTimeoutAsync(this.options.scanTimeOut);
    await this.startScanning();
  }

  public async startGame(gameConfiguration: hdmUtil.GameConfiguration) {
    logger.info('Starting Game');
    await this.stopScanning();
    let ourPeripherals = hdmUtil.intersection(this.allAddresses(), gameConfiguration.units.map(unit => unit.radioId));
    if (ourPeripherals.length === 0) {
      ourPeripherals = this.allAddresses();
    }

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

    await hdmUtil.setTimeoutAsync(this.options.scanTimeOut);
    await this.startScanning();
  }

  private discoverPeripherals(peripheral: Peripheral) {
    const localName = peripheral.advertisement.localName;
    const address = peripheral.address;

    let device;
    if (!this.hasDevice(address)) {
      device = new HitTrackerDevice(peripheral);
      this.seenPeripherals.set(address, device);
      logger.debug(`[${address}] NAME: ${localName.trimRight()}`);
    } else {
      device = this.getDevice(address);
      device.lastSeen = Date.now();
      logger.debug(`[${address}] RSSI ${peripheral.rssi} GAME ACTIVE: ${device.active}`);
    }
    device.parseAdvertisement();

    logger.debug(`[${address}] DATA: ${JSON.stringify(device.zoneHits)}`);

    device.zonesHit().forEach((zone: number) => {
      hdmUtil.sendRequest(this.baseUrl, address, zone + 1).catch(logger.error);
    });
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
