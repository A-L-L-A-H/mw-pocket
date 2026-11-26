import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useBottomTabs } from '../navigation/bottom-tabs'

export const HqFleetScreen: React.FC = () => {
  const { navigate } = useBottomTabs()

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>HQ Fleet Status</Text>
        <View style={styles.hud}>
          <Text style={styles.hudLabel}>Arena Level</Text>
          <Text style={styles.hudValue}>12</Text>
          <Text style={styles.hudLabel}>XP</Text>
          <Text style={styles.hudValue}>3,450</Text>
          <Text style={styles.hudLabel}>Streak</Text>
          <Text style={styles.hudValue}>7 days</Text>
        </View>

        <Text style={styles.sectionTitle}>Fleet Matrix (12+ Services)</Text>
        <View style={styles.fleetGrid}>
          {/* Service placeholders */}
          <View key="1" style={styles.serviceItem} />
          <View key="2" style={styles.serviceItem} />
          <View key="3" style={styles.serviceItem} />
          {/* ... more services */}
        </View>

        <TouchableOpacity style={styles.button} onPress={() => navigate('FleetProbe')}>
          <Text style={styles.buttonText}>Fleet Probe</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => navigate('ArsySeal')}>
          <Text style={styles.buttonText}>ARSY Merkle Seal</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#F8FAFC', marginBottom: 12, marginTop: 8 },
  hud: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  hudLabel: { color: '#94A3B8', fontSize: 14 },
  hudValue: { color: '#FF2A5F', fontSize: 16, fontWeight: '600' },
  fleetGrid: { gap: 8, flexWrap: 'wrap' },
  serviceItem: { width: '48%', height: 80, backgroundColor: '#131620', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  button: { marginTop: 20, padding: 12, backgroundColor: '#FF2A5F', borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#0A0B0F', fontWeight: '600' },
})