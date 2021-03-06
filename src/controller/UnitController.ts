import { Body, ContentType, Get, JsonController, NotFoundError, Param, Post } from 'routing-controllers';

import { HitTrackerDeviceManager } from '../ble';
import { ILedZonesConfig } from '../interfaces';
import { logger } from '../logging';

import { Inject } from 'typedi';

@JsonController()
export class UnitController {
  private timer!: NodeJS.Timer;
  private deviceManager: HitTrackerDeviceManager;

  constructor(@Inject('device-manager') deviceManager: HitTrackerDeviceManager) {
    this.deviceManager = deviceManager;
  }

  @Post('/unit/:address')
  @ContentType('application/json')
  public async setLedConfiguration(
    @Param('address') address: string,
    @Body({ required: true, validate: true })
    ledZoneConfigs: ILedZonesConfig
  ) {
    if (!this.deviceManager.hasDevice(address)) {
      throw new NotFoundError(`Peripheral ${address} was not found`);
    }
    logger.debug(`Setting unit ${address} LED configuration  to ${JSON.stringify(ledZoneConfigs)}`);
    try {
      await this.deviceManager.stopScanning();

      await this.deviceManager.getDevice(address).setLedConfiguration(ledZoneConfigs);
      await this.deviceManager.startScanning();
    } catch (error) {
      logger.error(error);
    }
    return { msg: `Set Led Configuration` };
  }

  @Post('/unit/:address/:value')
  @ContentType('application/json')
  public async unitToggle(@Param('address') address: string, @Param('value') value: number) {
    if (!this.deviceManager.hasDevice(address)) {
      throw new NotFoundError(`Peripheral ${address} was not found`);
    }
    logger.debug(`Setting unit ${address} status to ${value}`);
    try {
      await this.deviceManager.stopScanning();
      await this.deviceManager.getDevice(address).setGameStatus(value);

      await this.deviceManager.startScanning();
    } catch (error) {
      logger.error(error);
    }
    return { msg: `Setting unit ${address} status to ${value}` };
  }

  @Get('/unit')
  @ContentType('application/json')
  public async unitList() {
    return this.deviceManager.allAddresses();
  }
}
