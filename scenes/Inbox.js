import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  limit,
  getDocs,
  startAfter
} from 'firebase/firestore';
import { useAuth } from '../config/AuthContext';
import { db } from '../config/firebaseConfig';
import { useFocusEffect } from '@react-navigation/native';

const Inbox = ({ navigation }) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { currentUser } = useAuth();

  const loadChats = useCallback(() => {
    if (!currentUser) return;
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid),
      orderBy('lastMessageTimestamp', 'desc'),
      limit(20)
    );
    const unsubscribe = onSnapshot(
      chatsQuery,
      async (snapshot) => {
        if (snapshot.empty) {
          setChats([]);
          setLoading(false);
          return;
        }
        const chatList = [];
        for (const docSnap of snapshot.docs) {
          const chatData = docSnap.data();
          const otherUserId = chatData.participants.find(id => id !== currentUser.uid);
          if (!otherUserId) continue;
          const userDoc = await getDoc(doc(db, 'users', otherUserId));
          const userData = userDoc.exists() ? userDoc.data() : null;
          chatList.push({
            id: docSnap.id,
            otherUserId,
            otherUserName: userData?.userName || 'Unknown User',
            otherUserPhoto: userData?.photoURL || null,
            lastMessage: chatData.lastMessage || 'Start a conversation',
            lastMessageTimestamp: chatData.lastMessageTimestamp,
            unreadCount: chatData.unreadCount?.[currentUser.uid] || 0,
            isLastMessageMine: chatData.lastSenderId === currentUser.uid
          });
        }
        setChats(chatList);
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        console.error('Error loading chats:', error);
        Alert.alert('Error', 'Failed to load conversations.');
        setLoading(false);
        setRefreshing(false);
      }
    );
    return unsubscribe;
  }, [currentUser]);

  useEffect(() => {
    const unsubscribe = loadChats();
    return () => unsubscribe && unsubscribe();
  }, [loadChats]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadChats();
  };

  const navigateToChat = (chat) => {
    navigation.navigate('ChatRoom', {
      chatId: chat.id,
      userName: chat.otherUserName,
      otherUserId: chat.otherUserId
    });
  };

  const renderChatItem = ({ item }) => (
    <TouchableOpacity style={styles.chatCard} onPress={() => navigateToChat(item)}>
      <View style={styles.avatarContainer}>
        {item.otherUserPhoto ? (
          <Image source={{ uri: item.otherUserPhoto }} style={styles.avatar} />
        ) : (
          <View style={styles.defaultAvatar}>
            <Text style={styles.avatarLetter}>
              {item.otherUserName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        {item.unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadCount}>{item.unreadCount}</Text>
          </View>
        )}
      </View>
      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatTitle} numberOfLines={1}>
            {item.otherUserName}
          </Text>
          <Text style={styles.chatTime}>
            {item.lastMessageTimestamp
              ? new Date(item.lastMessageTimestamp.seconds * 1000)
                  .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''}
          </Text>
        </View>
        <View style={styles.chatPreview}>
          <Text style={[styles.chatLastMessage, item.isLastMessageMine && styles.myMessage]} numberOfLines={1}>
            {item.isLastMessageMine ? `You: ${item.lastMessage}` : item.lastMessage}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View> */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#007bff" />
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={renderChatItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#007bff']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubble-outline" size={80} color="#ccc" />
              <Text style={styles.emptyTitle}>No Conversations Yet</Text>
              <Text style={styles.emptyMessage}>
                Match with fellow fans and start chatting about your favorite anime!
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },

  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 10 },
  chatCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    marginVertical: 6,
    marginHorizontal: 10,
    padding: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 15
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#007bff'
  },
  defaultAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center'
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold'
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ff3b30',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#fff'
  },
  unreadCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  chatContent: {
    flex: 1,
    justifyContent: 'center'
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    color: '#333'
  },
  chatTime: {
    fontSize: 12,
    color: '#999',
    marginLeft: 10
  },
  chatPreview: {
    flexDirection: 'row'
  },
  chatLastMessage: {
    fontSize: 15,
    color: '#666'
  },
  myMessage: {
    fontStyle: 'italic',
    color: '#007bff'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 20,
    color: '#666'
  },
  emptyMessage: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22
  }
});

export default Inbox;
