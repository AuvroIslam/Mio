import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  limit,
  getDocs,
  startAfter,
  increment
} from 'firebase/firestore';
import { useAuth } from '../config/AuthContext';
import { db } from '../config/firebaseConfig';

const ChatRoom = ({ route, navigation }) => {
  const { chatId, userName, otherUserId } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [lastMessageDoc, setLastMessageDoc] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const { currentUser } = useAuth();
  const flatListRef = useRef(null);

  // Function to load paginated messages
  const loadMessages = async (startAfterDoc = null) => {
    let q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("timestamp", "desc"),
      limit(20)
    );
    if (startAfterDoc) {
      q = query(
        collection(db, "chats", chatId, "messages"),
        orderBy("timestamp", "desc"),
        startAfter(startAfterDoc),
        limit(20)
      );
    }
    const snapshot = await getDocs(q);
    const loadedMessages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return { messages: loadedMessages, lastVisible: snapshot.docs[snapshot.docs.length - 1] };
  };

  useEffect(() => {
    if (!chatId) {
      Alert.alert("Error", "Chat information is missing. Please try again.", [
        { text: "OK", onPress: () => navigation.goBack() }
      ]);
      return;
    }
    // Listen for realtime updates to messages
    const unsubscribe = onSnapshot(
      query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "desc"), limit(20)),
      (snapshot) => {
        const messageList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMessages(messageList);
        setLastMessageDoc(snapshot.docs[snapshot.docs.length - 1]);
        setLoading(false);
        // Scroll to bottom for new messages
        if (messageList.length > 0) {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      },
      (error) => {
        console.error("Error fetching messages:", error);
        Alert.alert("Error", "Failed to load messages");
        setLoading(false);
      }
    );

    // Mark messages as read by resetting unread count
    const markAsRead = async () => {
      try {
        const chatDocRef = doc(db, "chats", chatId);
        await updateDoc(chatDocRef, {
          [`unreadCount.${currentUser.uid}`]: 0
        });
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    };
    markAsRead();
    return () => unsubscribe();
  }, [chatId, navigation, currentUser]);

  // Load more messages when scrolling up
  const loadMoreMessages = async () => {
    if (!lastMessageDoc || loadingMore) return;
    setLoadingMore(true);
    const { messages: newMessages, lastVisible } = await loadMessages(lastMessageDoc);
    setMessages(prev => [...prev, ...newMessages]);
    setLastMessageDoc(lastVisible);
    setLoadingMore(false);
  };

  // Send message function with immediate input clear for better UX
  const sendMessage = async () => {
    if (!message.trim() || !chatId) return;
    try {
      const newMessage = {
        senderId: currentUser.uid,
        text: message.trim(),
        timestamp: serverTimestamp()
      };
      setMessage(''); // Clear input immediately
      await addDoc(collection(db, "chats", chatId, "messages"), newMessage);
      // Update chat metadata (last message, timestamp, and increment unread for recipient)
      const chatDocRef = doc(db, "chats", chatId);
      await updateDoc(chatDocRef, {
        lastMessage: message.trim(),
        lastMessageTimestamp: serverTimestamp(),
        lastSenderId: currentUser.uid,
        [`unreadCount.${otherUserId}`]: increment(1)
      });
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert("Error", "Failed to send message");
    }
  };

  // Render a single message bubble
  const renderMessage = ({ item }) => {
    const isCurrentUser = item.senderId === currentUser.uid;
    return (
      <View style={[
        styles.messageContainer,
        isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage
      ]}>
        <Text style={[
          styles.messageText,
          isCurrentUser ? styles.currentUserText : styles.otherUserText
        ]}>
          {item.text}
        </Text>
        <Text style={[
          styles.timestamp,
          isCurrentUser ? styles.currentUserTimestamp : styles.otherUserTimestamp
        ]}>
          {item.timestamp && item.timestamp.toDate
            ? item.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : ''}
        </Text>
      </View>
    );
  };

  if (!chatId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text>Missing chat information</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : null} style={styles.container} keyboardVerticalOffset={100}>
      {loading ? (
        <ActivityIndicator size="large" color="#007bff" style={styles.loader} />
      ) : (
        <>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            inverted
            onEndReached={loadMoreMessages}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color="#007bff" /> : null}
          />
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              value={message}
              onChangeText={setMessage}
              multiline
            />
            <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={!message.trim()}>
              <Ionicons name="send" size={24} color={message.trim() ? "#fff" : "#b3d9ff"} />
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#e9eff5'
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  messagesList: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    paddingBottom: 20
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  messageContainer: { 
    padding: 10, 
    marginVertical: 5, 
    borderRadius: 12, 
    maxWidth: '80%',
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2
  },
  currentUserMessage: { 
    alignSelf: 'flex-end', 
    backgroundColor: '#007bff'
  },
  otherUserMessage: { 
    alignSelf: 'flex-start', 
    backgroundColor: '#f0f0f0'
  },
  messageText: { 
    fontSize: 16 
  },
  currentUserText: {
    color: '#fff'
  },
  otherUserText: {
    color: '#333'
  },
  timestamp: { 
    fontSize: 12, 
    marginTop: 5, 
    alignSelf: 'flex-end' 
  },
  currentUserTimestamp: {
    color: 'rgba(255, 255, 255, 0.8)'
  },
  otherUserTimestamp: {
    color: 'rgba(0, 0, 0, 0.5)'
  },
  inputContainer: { 
    flexDirection: 'row', 
    padding: 10, 
    backgroundColor: '#fff', 
    borderTopWidth: 1,
    borderTopColor: '#ddd'
  },
  input: { 
    flex: 1, 
    padding: 10, 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 20,
    maxHeight: 100,
    backgroundColor: '#f9f9f9'
  },
  sendButton: { 
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007bff', 
    borderRadius: 22, 
    marginLeft: 8
  }
});

export default ChatRoom;
