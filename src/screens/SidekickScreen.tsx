import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useBottomTabs } from '../navigation/bottom-tabs'

export const SidekickScreen: React.FC = () => {
  const { navigate } = useBottomTabs()

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Shadow Sidekick AI</Text>
        <View style={styles.aiChat}>
          <ActivityIndicator size="large" />
          <Text style={styles.chatPlaceholder}>AI chat placeholder - loading...</Text>
        </View>

        <Text style={styles.sectionTitle}>Coding Agent Missions</Text>
        <View style={styles.missionsList}>
          <TouchableOpacity style={styles.missionItem} onPress={() => navigate('LaunchMission', { mission: 'code-review' })}>
            <Text style={styles.missionText}>Code Review Mission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.missionItem} onPress={() => navigate('LaunchMission', { mission: 'refactor' })}>
            <Text style={styles.missionText}>Refactor Mission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.missionItem} onPress={() => navigate('LaunchMission', { mission: 'test-gen' })}>
            <Text style={styles.missionText}>Test Generation Mission</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={() => navigate('SidekickHistory')}>
          <Text style={styles.buttonText}>View Mission History</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#F8FAFC', marginBottom: 12, marginTop: 8 },
  aiChat: { height: 180, backgroundColor: '#131620', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },
  chatPlaceholder: { color: '#64748B', fontStyle: 'italic' },
  missionsList: { gap: 12, marginTop: 12 },
  missionItem: { padding: 12, backgroundColor: '#1A1F2E', borderRadius: 8, alignItems: 'center' },
  missionText: { color: '#F8FAFC' },
  button: { marginTop: 20, padding: 12, backgroundColor: '#FF2A5F', borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#0A0B0F', fontWeight: '600' },
})