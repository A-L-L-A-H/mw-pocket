import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useNavigation, NavigationProp, ParamListBase } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'

type PocketTabParamList = {
  HqFleet: undefined
  OpsGuard: undefined
  Sidekick: undefined
  WorldRadar: undefined
  Comms: undefined
  BountyVault: undefined
  MyLove: undefined
  Settings: undefined
  AdvanceTask: undefined
  FleetProbe: undefined
  ArsySeal: undefined
  LaunchMission: undefined
  SidekickHistory: undefined
}

const Tab = createBottomTabNavigator<PocketTabParamList>()

export const useBottomTabs = () => {
  const navigation = useNavigation<NavigationProp<PocketTabParamList>>()
  return {
    navigate: (name: keyof PocketTabParamList, params?: any) => navigation.navigate(name, params),
  }
}