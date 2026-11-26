import React from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Image, TouchableOpacity } from 'react-native'
import { useBottomTabs } from '../navigation/bottom-tabs'
import { DailyPromiseCard } from '../api/client'

export const MyLoveScreen: React.FC = () => {
  const { navigate } = useBottomTabs()
  const [cards, setCards] = React.useState<DailyPromiseCard[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    ;(async () => {
      try {
        const client = (global as any).__MOBILE_CLIENT__
        const result = await client.getDailyPromiseCards()
        setCards(result.payload)
      } catch (e) {
        console.error('MyLove fetch error:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Daily GOD PROMISE</Text>
        {loading ? (
          <ActivityIndicator size="large" />
        ) : (
          cards.map((card) => (
            <View key={card.id} style={styles.card}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardVerse}>{card.verseRef}</Text>
              <Text style={styles.cardArabic}>{card.arabicText}</Text>
              <Text style={styles.cardTranslation}>{card.translation}</Text>
              <Image
                source={require('../assets/crescent-mark.svg')}
                style={styles.cardIcon}
              />
            </View>
          ))
        )}

        <TouchableOpacity style={styles.button} onPress={() => navigate('Settings')}>
          <Text style={styles.buttonText}>Settings</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}



const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#F8FAFC', marginBottom: 12, marginTop: 8 },
  card: { backgroundColor: '#131620', borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTitle: { color: '#FF2A5F', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  cardVerse: { color: '#94A3B8', fontSize: 14, marginBottom: 4 },
  cardArabic: { color: '#F5B731', fontSize: 14, marginBottom: 4 },
  cardTranslation: { color: '#64748B', fontSize: 13, marginBottom: 8 },
  cardIcon: { width: 24, height: 24, marginTop: 4 },
  button: { marginTop: 20, padding: 12, backgroundColor: '#FF2A5F', borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#0A0B0F', fontWeight: '600' },
})