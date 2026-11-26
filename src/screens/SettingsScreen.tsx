import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Clipboard } from 'react-native'
import { BarCodeScanner } from 'expo-barcode-scanner'
import { parsePairUri } from '../../src/pairing/pairUri'

export const SettingsScreen: React.FC = () => {
  const [serverUrl, setServerUrl] = React.useState<string>('http://192.168.1.10:3000')
  const [oidcState, setOidcState] = React.useState<'signed-in' | 'signed-out' | 'unknown'>('unknown')
  const [cacheStatus, setCacheStatus] = React.useState<'healthy' | 'stale' | 'empty'>('healthy')
  const [scanning, setScanning] = React.useState(false)
  const [scannedUri, setScannedUri] = React.useState<string | null>(null)

  const signInOidc = async () => {
    try {
      setOidcState('signed-in')
    } catch (e) {
      setOidcState('unknown')
      Alert.alert('Sign in failed', String(e))
    }
  }

  const signOutOidc = async () => {
    try {
      setOidcState('signed-out')
    } catch (e) {
      setOidcState('unknown')
      Alert.alert('Sign out failed', String(e))
    }
  }

  const handleBarCodeScanned = async (scanned: { type: string; data: string }) => {
    setScanning(false)
    const data = scanned.data
    setScannedUri(data)
    try {
      const parsed = parsePairUri(data)
      if (parsed) {
        Alert.alert('Pairing URI Parsed', `Echo: ${parsed.echoUrl}\nRID: ${parsed.ridUrl}\nMyLove: ${parsed.myloveUrl}`)
      }
    } catch (e) {
      Alert.alert('Invalid Pairing URI', String(e))
    }
  }

  const scanPairingQr = async () => {
    setScanning(true)
  }

  const pastePairUriManual = async () => {
    try {
      const uri = await Clipboard.getString()
      if (uri) {
        const parsed = parsePairUri(uri)
        if (parsed) {
          Alert.alert('Pairing URI Parsed', `Echo: ${parsed.echoUrl}\nRID: ${parsed.ridUrl}\nMyLove: ${parsed.myloveUrl}`)
        }
      }
    } catch (e) {
      Alert.alert('Invalid URI', String(e))
    }
  }

  const toggleCache = async () => {
    setCacheStatus(cacheStatus === 'healthy' ? 'stale' : 'healthy')
  }

  const cacheColor = (status: 'healthy' | 'stale' | 'empty'): string => {
    switch (status) {
      case 'healthy': return '#10B981'
      case 'stale': return '#F5B731'
      case 'empty': return '#EF4444'
      default: return '#64748B'
    }
  }

  if (scanning) {
    return (
      <View style={styles.container}>
        <BarCodeScanner
          onBarCodeScanned={handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>MoonWitness Pocket Settings</Text>

        {/* OIDC Section */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>OIDC Sign In</Text>
          <TouchableOpacity style={styles.settingToggle} onPress={signInOidc}>
            <Text style={[styles.settingValue, oidcState === 'signed-in' ? styles.signedIn : styles.signedOut]}>
              {oidcState}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingToggle} onPress={signOutOidc}>
            <Text style={styles.settingValue}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Server URLs */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Echo Server URL</Text>
          <Text style={styles.settingValue}>{serverUrl}</Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>RID Server URL</Text>
          <Text style={styles.settingValue}>http://192.168.1.10:3005</Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>MyLove URL</Text>
          <Text style={styles.settingValue}>https://a-l-l-a-h.com</Text>
        </View>

        {/* Pairing Section */}
        <View style={styles.sectionTitleStyle}>Pairing Configuration</View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Scan QR Code</Text>
          <TouchableOpacity style={styles.settingToggle} onPress={scanPairingQr}>
            <Text style={styles.settingValue}>Use Camera</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Paste URI Manually</Text>
          <TouchableOpacity style={styles.settingToggle} onPress={pastePairUriManual}>
            <Text style={styles.settingValue}>Paste from Clipboard</Text>
          </TouchableOpacity>
        </View>

        {/* Cache Status */}
        <View style={styles.sectionTitleStyle}>Cache</View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Snapshot Cache</Text>
          <Text style={[styles.settingValue, { color: cacheColor(cacheStatus) }]}>{cacheStatus}</Text>
        </View>
        <TouchableOpacity style={styles.settingToggle} onPress={toggleCache}>
          <Text style={styles.settingValue}>Toggle Cache</Text>
        </TouchableOpacity>

        {/* Version & Help */}
        <View style={styles.sectionTitleStyle}>Version & Help</View>
        <Text style={styles.settingLabel}>Version 1.0.0</Text>
        <Text style={styles.settingLabel}>Built with Expo SDK 52</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: '#F8FAFC', marginBottom: 20 },
  sectionTitleStyle: { fontSize: 16, fontWeight: '500', color: '#F5B731', marginBottom: 8, marginTop: 8 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottomColor: '#252B3D', borderBottomWidth: 1 },
  settingLabel: { color: '#64748B', fontSize: 14 },
  settingToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  settingValue: { color: '#F8FAFC', fontSize: 14 },
  signedIn: { color: '#10B981' },
  signedOut: { color: '#EF4444' },
})