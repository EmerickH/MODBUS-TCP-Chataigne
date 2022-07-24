# ![MODBUS Logo](icon.png) TCP MODBUS module for Chataigne

**This module allows you to control MODBUS devices over network**

NOTE: this project is still in developpement, not all MODBUS commands are available and it might contain some bugs!

## Available features
 * **Read multiple coils, holding registers and input registers at the same time**
 
   Use the "Read data" command to fetch data from the device. Your values will now be stored in the "Values" field of the module.
 * **Write to any coil or holding register**
 * **Write/read files**
 * **Receive and decode errors**

## Based on official MODBUS documentation
 * [MODBUS Application Protocol Specification V1.1b3](https://www.modbus.org/docs/Modbus_Application_Protocol_V1_1b3.pdf)
 * [MODBUS Messaging on TCP/IP Implementation Guide V1.0b](https://www.modbus.org/docs/Modbus_Messaging_Implementation_Guide_V1_0b.pdf)
