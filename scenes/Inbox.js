// Inbox.js
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../config/AuthContext';
import { Ionicons } from '@expo/vector-icons';

const Inbox = ({ navigation }) => {
  const { currentUser } = useAuth();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    const chatsRef = collection(db, 'chats');
    // Query chats where currentUser is a participant, ordered by lastMessageTime descending
    const q = query(chatsRef, where('participants', 'array-contains', currentUser.uid), orderBy('lastMessageTime', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatItems = [];
      // For each chat document, determine the other user's id and name.
      for (const chatDoc of snapshot.docs) {
        const chatData = chatDoc.data();
        const otherUserId = chatData.participants.find(id => id !== currentUser.uid);
        let otherUserName = 'Unknown';

        // Option: If your chat document stores a mapping of participant names,
        // you could do:
        if (chatData.participantNames && chatData.participantNames[otherUserId]) {
          otherUserName = chatData.participantNames[otherUserId];
        } else {
          // Otherwise, query the "users" collection for the other user's displayName
          const userRef = doc(db, 'users', otherUserId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            otherUserName = userSnap.data().displayName || 'Unknown';
          }
        }

        chatItems.push({
          id: chatDoc.id,
          otherUserName,
          lastMessage: chatData.lastMessage,
          lastMessageTime: chatData.lastMessageTime ? chatData.lastMessageTime.toDate() : null
        });
      }
      setChats(chatItems);
      setLoading(false);
    }, (error) => {
      console.error("Error loading chats: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const renderItem = ({ item }) => {
    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => navigation.navigate('ChatRoom', { chatId: item.id, userName: item.otherUserName })}
      >
        <View style={styles.chatInfo}>
          <Text style={styles.chatTitle}>{item.otherUserName}</Text>
          <Text style={styles.chatLastMessage} numberOfLines={1}>{item.lastMessage}</Text>
        </View>
        {item.lastMessageTime && (
          <Text style={styles.chatTime}>
            {item.lastMessageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubble-ellipses-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>No chats yet</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, marginTop: 10, color: '#555' },
  listContent: { padding: 10 },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomColor: '#ddd', borderBottomWidth: 1 },
  chatInfo: { flex: 1 },
  chatTitle: { fontSize: 16, fontWeight: 'bold' },
  chatLastMessage: { fontSize: 14, color: '#555' },
  chatTime: { fontSize: 12, color: '#999' }
});

export default Inbox;
