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
  white?: number;
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
