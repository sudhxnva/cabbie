import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Configuration options for Cabbie
 */
export interface CabbieConfig {
  // Server
  port: number;
  nodeEnv: string;
  
  // MongoDB
  mongodbUri: string;
  
  // Emulator
  emulatorMode: 'local' | 'remote';
  androidSdkHostPath: string;
  emulatorSerials: string[];
  
  // MCP Server
  mcpServerCommand: string;
  mcpServerArgs: string[];
  androidMcpDirectory?: string;
  
  // Debug
  debug: boolean;
}

/**
 * Get configuration from environment variables
 */
export function getConfig(): CabbieConfig {
  // Parse emulator serials from comma-separated string
  const emulatorSerialsStr = process.env.EMULATOR_SERIALS || 'emulator-5554,emulator-5556';
  const emulatorSerials = emulatorSerialsStr.split(',').map(s => s.trim()).filter(Boolean);
  
  // Parse MCP server args from space-separated string
  const mcpServerArgsStr = process.env.MCP_SERVER_ARGS || '-y adb-mcp';
  const mcpServerArgs = mcpServerArgsStr.split(' ').filter(Boolean);
  
  return {
    // Server
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // MongoDB - support both MONGODB_URI and MONGO_URI for backward compatibility
    mongodbUri: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://mongodb:27017/cabbie',
    
    // Emulator
    emulatorMode: (process.env.EMULATOR_MODE as 'local' | 'remote') || 'local',
    androidSdkHostPath: process.env.ANDROID_SDK_HOST_PATH || '~/Android/Sdk',
    emulatorSerials,
    
    // MCP Server
    mcpServerCommand: process.env.MCP_SERVER_COMMAND || 'npx',
    mcpServerArgs,
    androidMcpDirectory: process.env.ANDROID_MCP_DIRECTORY,
    
    // Debug
    debug: process.env.DEBUG === 'true',
  };
}

// Export a singleton config instance
export const config = getConfig();
