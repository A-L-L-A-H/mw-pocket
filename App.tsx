import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  Activity,
  Bot,
  Briefcase,
  MessageSquare,
  Moon,
  Radar,
  Settings,
  Ticket,
  Trophy
} from "lucide-react-native";
import { PocketProvider } from "./src/context/PocketContext";
import { HqFleetScreen } from "./src/screens/HqFleetScreen";
import { BusinessOpsScreen } from "./src/screens/BusinessOpsScreen";
import { VoucherGeneratorScreen } from "./src/screens/VoucherGeneratorScreen";
import { SidekickScreen } from "./src/screens/SidekickScreen";
import { WorldRadarScreen } from "./src/screens/WorldRadarScreen";
import { CommsScreen } from "./src/screens/CommsScreen";
import { BountyVaultScreen } from "./src/screens/BountyVaultScreen";
import { MyLoveScreen } from "./src/screens/MyLoveScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { RIOT_COLORS } from "./src/theme/riot";

const Tab = createBottomTabNavigator();

const POCKET_NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: RIOT_COLORS.canvas,
    card: RIOT_COLORS.surface,
    text: RIOT_COLORS.textPrimary,
    border: RIOT_COLORS.border,
    primary: RIOT_COLORS.sovereignGold
  }
};

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <PocketProvider>
        <NavigationContainer theme={POCKET_NAV_THEME}>
          <StatusBar style="light" backgroundColor={RIOT_COLORS.canvas} />
          <Tab.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: RIOT_COLORS.surface },
              headerTintColor: RIOT_COLORS.textPrimary,
              tabBarStyle: {
                backgroundColor: RIOT_COLORS.surface,
                borderTopColor: RIOT_COLORS.border
              },
              tabBarActiveTintColor: RIOT_COLORS.sovereignGold,
              tabBarInactiveTintColor: RIOT_COLORS.textMuted
            }}
          >
            <Tab.Screen
              name="HQ"
              component={HqFleetScreen}
              options={{
                title: "HQ & Fleet",
                tabBarIcon: ({ color, size }) => <Activity color={color} size={size} />
              }}
            />
            <Tab.Screen
              name="Ops"
              component={BusinessOpsScreen}
              options={{
                title: "Ops",
                tabBarIcon: ({ color, size }) => <Briefcase color={color} size={size} />
              }}
            />
            <Tab.Screen
              name="Vouchers"
              component={VoucherGeneratorScreen}
              options={{
                title: "Vouchers",
                tabBarIcon: ({ color, size }) => <Ticket color={color} size={size} />
              }}
            />
            <Tab.Screen
              name="Sidekick"
              component={SidekickScreen}
              options={{
                title: "Sidekick",
                tabBarIcon: ({ color, size }) => <Bot color={color} size={size} />
              }}
            />
            <Tab.Screen
              name="Radar"
              component={WorldRadarScreen}
              options={{
                title: "Radar",
                tabBarIcon: ({ color, size }) => <Radar color={color} size={size} />
              }}
            />
            <Tab.Screen
              name="Comms"
              component={CommsScreen}
              options={{
                title: "Comms",
                tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />
              }}
            />
            <Tab.Screen
              name="Vault"
              component={BountyVaultScreen}
              options={{
                title: "Vault",
                tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} />
              }}
            />
            <Tab.Screen
              name="MyLove"
              component={MyLoveScreen}
              options={{
                title: "MyLove",
                tabBarIcon: ({ color, size }) => <Moon color={color} size={size} />
              }}
            />
            <Tab.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                title: "Settings",
                tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </PocketProvider>
    </SafeAreaProvider>
  );
}
