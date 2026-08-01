// WebUSB & Web Serial type declarations (not in default TS DOM lib)

interface USBEndpoint {
  endpointNumber: number;
  direction: 'in' | 'out';
  type: 'control' | 'interrupt' | 'bulk' | 'iso';
  packetSize: number;
}

interface USBAlternateInterface {
  alternateSetting: number;
  interfaceClass: number;
  interfaceSubclass: number;
  interfaceProtocol: number;
  interfaceName: string | null;
  endpoints: USBEndpoint[];
}

interface USBInterface {
  interfaceNumber: number;
  alternates: USBAlternateInterface[];
  claimed: boolean;
}

interface USBConfiguration {
  configurationValue: number;
  configurationName: string | null;
  interfaces: USBInterface[];
}

interface USBDevice {
  deviceName: string;
  manufacturerName: string;
  productId: number;
  productName?: string;
  serialNumber: string;
  vendorId: number;
  usbVersionMajor: number;
  usbVersionMinor: number;
  usbVersionSubminor: number;
  deviceClass: number;
  deviceSubclass: number;
  deviceProtocol: number;
  configurations: USBConfiguration[];
  configuration: USBConfiguration | null;
  opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>;
  controlTransferIn(setup: USBControlTransferParameters, length: number): Promise<USBInTransferResult>;
  controlTransferOut(setup: USBControlTransferParameters, data?: BufferSource): Promise<USBOutTransferResult>;
  clearHalt(direction: USBDirection, endpointNumber: number): Promise<void>;
  transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
  reset(): Promise<void>;
}

interface USBInTransferResult { data: DataView | null; status: USBTransferStatus; }
interface USBOutTransferResult { bytesWritten: number; status: USBTransferStatus; }
type USBTransferStatus = 'ok' | 'stall' | 'babble';
type USBDirection = 'in' | 'out';
interface USBControlTransferParameters { request: number; value: number; index: number; }
interface USBDeviceFilter { vendorId?: number; productId?: number; classCode?: number; subclassCode?: number; protocolCode?: number; serialNumber?: string; }

interface USB {
  getDevices(): Promise<USBDevice[]>;
  requestDevice(options: { filters: USBDeviceFilter[] }): Promise<USBDevice>;
}

interface SerialOptions { baudRate: number; dataBits?: 7 | 8; stopBits?: 1 | 2; parity?: 'none' | 'even' | 'odd'; bufferSize?: number; flowControl?: 'none' | 'hardware'; }
interface SerialPortInfo { usbVendorId?: number; usbProductId?: number; }
interface WritableStreamWriter { write(data: BufferSource): Promise<void>; close(): Promise<void>; releaseLock(): void; ready: Promise<void>; closed: Promise<void>; desiredSize: number | null; }

interface SerialPort {
  readable: unknown | null;
  writable: { getWriter(): WritableStreamWriter } | null;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}

interface Serial {
  getPorts(): Promise<SerialPort[]>;
  requestPort(options?: { filters: unknown[] }): Promise<SerialPort>;
}

interface Navigator {
  usb?: USB;
  serial?: Serial;
}
