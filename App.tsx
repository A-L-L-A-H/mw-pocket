import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons, AntDesign } from '@expo/vector-icons'

import { HqFleetScreen } from './src/screens/HqFleetScreen'
import { SidekickScreen } from './src/screens/SidekickScreen'
import { WorldRadarScreen } from './src/screens/WorldRadarScreen'
import { CommsScreen } from './src/screens/CommsScreen'
import { BountyVaultScreen } from './src/screens/BountyVaultScreen'
import { MyLoveScreen } from './src/screens/MyLoveScreen'
import { SettingsScreen } from './src/screens/SettingsScreen'

import { RIOT_COLORS } from './src/theme/riot'

const Tab = createBottomTabNavigator()

export const App: React.FC = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }: { route: { name: string } }) => ({
          tabBarActiveTintColor: RIOT_COLORS.riotCrimson,
          tabBarInactiveTintColor: RIOT_COLORS.surfaceElevated,
          tabBarStyle: {
            backgroundColor: RIOT_COLORS.canvas,
            borderTopWidth: 0,
          },
        })}
      >
        <Tab.Screen
          name="HqFleet"
          component={HqFleetScreen}
          options={{
            tabBarLabel: 'HQ Fleet',
            tabBarIcon: ({ color }: { color: string }) => (
              <Ionicons name="desktop" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Sidekick"
          component={SidekickScreen}
          options={{
            tabBarLabel: 'Sidekick',
            tabBarIcon: ({ color }: { color: string }) => (
              <Ionicons name="chatbubbles" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="WorldRadar"
          component={WorldRadarScreen}
          options={{
            tabBarLabel: 'World Radar',
            tabBarIcon: ({ color }: { color: string }) => (
              <Ionicons name="globe" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Comms"
          component={CommsScreen}
          options={{
            tabBarLabel: 'Comms',
            tabBarIcon: ({ color }: { color: string }) => (
              <Ionicons name="chatbox" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="BountyVault"
          component={BountyVaultScreen}
          options={{
            tabBarLabel: 'BountyVault',
            tabBarIcon: ({ color }: { color: string }) => (
              <AntDesign name="frown" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="MyLove"
          component={MyLoveScreen}
          options={{
            tabBarLabel: 'MyLove',
            tabBarIcon: ({ color }: { color: string }) => (
              <Ionicons name="heart" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: 'Settings',
            tabBarIcon: ({ color }: { color: string }) => (
              <Ionicons name="settings" size={24} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  )
}