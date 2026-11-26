import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput } from 'react-native'
import { useBottomTabs } from '../navigation/bottom-tabs'

export const CommsScreen: React.FC = () => {
  const { navigate } = useBottomTabs()
  const [channels, setChannels] = React.useState<{ name: string; ready: boolean }[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    ;(async () => {
      try {
        const client = (global as any).__MOBILE_CLIENT__
        // Simplified - would call actual comms APIs
        setChannels([
          { name: 'WhatsApp GOWA', ready: true },
          { name: 'Telegram', ready: false },
          { name: 'Discord', ready: true },
        ])
      } catch (e) {
        console.error('Comms fetch error:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const composeMessage = async (channel: string, recipient: string, message: string) => {
    try {
      const client = (global as any).__MOBILE_CLIENT__
      // Would call sendCommsMessage API
      console.log(`Sending to ${channel}: ${message}`)
    } catch (e) {
      console.error('Compose error:', e)
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Unified Composer</Text>
        {loading ? (
          <ActivityIndicator size="large" />
        ) : (
          <View style={styles.channelsList}>
            {channels.map((channel) => (
              <View key={channel.name} style={styles.channelItem}>
                <Text style={styles.channelName}>{channel.name}</Text>
                <Text style={[styles.channelStatus, channel.ready ? styles.statusReady : styles.statusUnready]}>
                  {channel.ready ? 'Connected' : 'Disconnected'}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.composer}>
          <TextInput placeholder="Compose message..." style={styles.input} />
          <TouchableOpacity style={styles.sendButton} onPress={() => {}}>
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#F8FAFC', marginBottom: 12, marginTop: 8 },
  channelsList: { gap: 12, marginTop: 12 },
  channelItem: { padding: 12, backgroundColor: '#1A1F2E', borderRadius: 8 },
  channelName: { color: '#F8FAFC', fontWeight: '600' },
  statusReady: { color: '#10B981' },
  statusUnready: { color: '#EF4444' },
  channelStatus: { color: '#64748B', fontSize: 12, marginTop: 4 },
  composer: { marginTop: 20, flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: '#131620', color: '#F8FAFC', padding: 12, borderRadius: 8 },
  sendButton: { backgroundColor: '#FF2A5F', padding: 12, borderRadius: 8, minWidth: 80 },
  sendText: { color: '#0A0B0F', fontWeight: '600' },
})