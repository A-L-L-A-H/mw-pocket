import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { useBottomTabs } from '../navigation/bottom-tabs'

export const WorldRadarScreen: React.FC = () => {
  const { navigate } = useBottomTabs()
  const [events, setEvents] = React.useState<RadarEventEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)

  React.useEffect(() => {
    ;(async () => {
      try {
        const client = (global as any).__MOBILE_CLIENT__
        const result = await client.getRadarEvents()
        setEvents(result.payload)
      } catch (e) {
        console.error('Radar fetch error:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const client = (global as any).__MOBILE_CLIENT__
      const result = await client.getRadarEvents()
      setEvents(result.payload)
    } catch (e) {
      console.error('Radar refresh error:', e)
    } finally {
      setRefreshing(false)
    }
  }

  const handleAcknowledge = async (eventId: string) => {
    try {
      const client = (global as any).__MOBILE_CLIENT__
      await client.acknowledgeRadarEvent(eventId)
      setEvents(events.map(e => e.id === eventId ? { ...e, acknowledged: true } : e))
    } catch (e) {
      console.error('Acknowledge error:', e)
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <Text style={styles.sectionTitle}>World Radar Feed</Text>
        {loading ? (
          <ActivityIndicator size="large" />
        ) : (
          events.length === 0 ? (
            <Text style={styles.emptyState}>No events found</Text>
          ) : (
            <View style={styles.eventsGrid}>
              {events.map((event) => (
                <TouchableOpacity
                  key={event.id}
                  style={[styles.radarCard, { borderLeftColor: getSeverityColor(event.severity) }]}
                  onPress={() => handleAcknowledge(event.id)}
                >
                  <Text style={styles.radarSource}>{event.source}</Text>
                  <Text style={styles.radarSeverity}>{event.severity}</Text>
                  <Text style={styles.radarHeadline}>{event.headline}</Text>
                  <Text style={styles.radarTime}>{event.timestamp}</Text>
                  <Text style={styles.radarAck}>{event.acknowledged ? '✓ Acknowledged' : '• pending'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )
        )}
      </ScrollView>
    </View>
  )
}

interface RadarEventEntry {
  id: string
  source: string
  severity: string
  headline: string
  timestamp: string
  acknowledged: boolean
}

function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return '#EF4444'
    case 'high':
      return '#F59E0B'
    case 'medium':
      return '#22D3EE'
    default:
      return '#10B981'
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#F8FAFC', marginBottom: 12, marginTop: 8 },
  emptyState: { color: '#64748B', fontSize: 16, marginTop: 20 },
  eventsGrid: {
    gap: 12,
    marginTop: 12,
  },
  radarCard: {
    backgroundColor: '#131620',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
  },
  radarSource: { color: '#22D3EE', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  radarSeverity: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FF2A5F',
    color: '#0A0B0F',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 10,
  },
  radarHeadline: { color: '#F8FAFC', fontSize: 14, marginBottom: 4 },
  radarTime: { color: '#64748B', fontSize: 11, marginTop: 4 },
  radarAck: { color: '#10B981', fontSize: 11, marginTop: 2 },
})