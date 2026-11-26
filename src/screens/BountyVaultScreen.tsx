import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, FlatList } from 'react-native'
import { useBottomTabs } from '../navigation/bottom-tabs'

export const BountyVaultScreen: React.FC = () => {
  const { navigate } = useBottomTabs()
  const [bounties, setBounties] = React.useState<BountyTaskEntry[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    ;(async () => {
      try {
        const client = (global as any).__MOBILE_CLIENT__
        const result = await client.getBountyTasks()
        setBounties(result.payload)
      } catch (e) {
        console.error('Bounty fetch error:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const advanceTask = async (taskId: string, nextStatus: BountyTaskEntry['status']) => {
    try {
      const client = (global as any).__MOBILE_CLIENT__
      await client.advanceBountyTask(taskId, nextStatus)
      setBounties(bounties.map(b => b.id === taskId ? { ...b, status: nextStatus } : b))
    } catch (e) {
      console.error('Advance error:', e)
    }
  }

  const triggerBackup = async () => {
    try {
      const client = (global as any).__MOBILE_CLIENT__
      const result = await client.triggerNineDriveBackup()
      if (result.triggered) {
        // Show success
      }
    } catch (e) {
      console.error('Backup error:', e)
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Bounty & Vault</Text>
        {loading ? (
          <ActivityIndicator size="large" style={styles.loading} />
        ) : (
          <FlatList
            data={bounties}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.bountyItem}>
                <Text style={styles.bountyTitle}>{item.title}</Text>
                <Text style={styles.bountyStatus}>{item.status}</Text>
                <Text style={styles.bountyXp}>+{item.xpReward} XP</Text>
                <TouchableOpacity style={styles.priorityBadge} onPress={() => navigate('AdvanceTask', { taskId: item.id, nextStatus: 'done' })}>
                  <Text style={styles.priorityText}>{item.priority}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.button} onPress={() => triggerBackup()}>
                  <Text style={styles.buttonText}>9Drive Backup</Text>
                </TouchableOpacity>
              </View>
            )}
            numColumns={2}
          />
        )}

        <TouchableOpacity style={styles.button} onPress={() => navigate('Settings')}>
          <Text style={styles.buttonText}>Settings</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

interface BountyTaskEntry {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'review' | 'done'
  xpReward: number
  priority: 'P0' | 'P1' | 'P2'
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#F8FAFC', marginBottom: 12, marginTop: 8 },
  loading: { marginTop: 20 },
  bountyItem: { padding: 12, backgroundColor: '#1A1F2E', borderRadius: 8, marginBottom: 8 },
  bountyTitle: { color: '#F8FAFC', fontWeight: '600', fontSize: 14 },
  bountyStatus: { color: '#FF2A5F', fontSize: 12 },
  bountyXp: { color: '#F5B731', marginLeft: 8, fontSize: 12 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#7C3AED', borderRadius: 4, marginLeft: 8, fontSize: 10 },
  priorityText: { color: '#F8FAFC', fontSize: 10, fontWeight: '600' },
  button: { marginTop: 20, padding: 12, backgroundColor: '#FF2A5F', borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#0A0B0F', fontWeight: '600' },
})