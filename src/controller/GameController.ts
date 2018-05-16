import { Body, ContentType, Get, JsonController, NotFoundError, Param, Post } from 'routing-controllers';

import {HitTrackerDeviceManager }  from '../ble';
import { GameConfiguration } from '../util';

import { logger } from '../logging';

import {Inject} from "typedi";

@JsonController()
export class GameController {
  private gameTimer!: NodeJS.Timer;
  private deviceManager: HitTrackerDeviceManager;

  constructor(@Inject('device-manager') deviceManager: HitTrackerDeviceManager)
  {
    this.deviceManager = deviceManager;
  }
  @Post('/start')
  @ContentType('application/json')
  public async start(
    @Body({ required: true, validate: true })
    gameConfiguration: GameConfiguration
  ) {
    logger.debug(`Starting Game with configuration: ${JSON.stringify(gameConfiguration)}`);
    try {
      await this.deviceManager.startGame(gameConfiguration);
    } catch (error) {
      logger.error(error);
    }

    this.gameTimer = setTimeout((config: GameConfiguration) => {
      this.deviceManager.stopGame(config);
    }, gameConfiguration.gameLength * 1000, gameConfiguration);

    return { msg: 'Started Game' };
  }

  @Post('/stop')
  @ContentType('application/json')
  public async stop(
    @Body({ required: true, validate: true })
    gameConfiguration: GameConfiguration
  ) {
    logger.debug('Stopping Game');

    try {
      await this.deviceManager.stopGame(gameConfiguration);
    } catch (error) {
      logger.error(error);
    }

    if (this.gameTimer) {
      clearTimeout(this.gameTimer);
    }

    return { msg: 'Stopped Game' };
  }
}
