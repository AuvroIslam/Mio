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
import { db } from '../config/firebaseConfig';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp
} from 'firebase/firestore';
import { useAuth } from '../config/AuthContext';

const ChatRoom = ({ route, navigation }) => {
  // Provide a default empty object for route.params to prevent errors
  const params = route?.params || {};
  const { chatId, userName } = params;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const { currentUser } = useAuth();
  const flatListRef = useRef(null);

  // Check if required parameters are present
  useEffect(() => {
    if (!chatId) {
      Alert.alert(
        "Error",
        "Chat information is missing. Please try again.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
      return;
    }
    // Use the subcollection 'messages' under the chat document
    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messageList = [];
      snapshot.forEach((doc) => {
        messageList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setMessages(messageList);
      setLoading(false);

      // Scroll to bottom on new messages
      if (messageList.length > 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    }, (error) => {
      console.error("Error fetching messages:", error);
      Alert.alert("Error", "Failed to load messages");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [chatId, navigation]);

  const sendMessage = async () => {
    if (!message.trim() || !chatId) return;

    try {
      const newMessage = {
        senderId: currentUser?.uid,
        text: message.trim(),
        timestamp: serverTimestamp()
      };

      // Save message in the subcollection 'messages'
      await addDoc(collection(db, "chats", chatId, "messages"), newMessage);

      // Update the last message in the chat document
      const chatDocRef = doc(db, "chats", chatId);
      await updateDoc(chatDocRef, {
        lastMessage: message.trim(),
        lastMessageTime: serverTimestamp()
      });

      // Clear the input
      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert("Error", "Failed to send message");
    }
  };

  const renderMessage = ({ item }) => {
    const isCurrentUser = item.senderId === currentUser?.uid;
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
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : null}
      style={styles.container}
      keyboardVerticalOffset={100}
    >
      {loading ? (
        <ActivityIndicator size="large" color="#007bff" style={styles.loader} />
      ) : (
        <>
          {messages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={60} color="#ccc" />
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>
                Send a message to start chatting with {userName || "this user"}
              </Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.messagesList}
              onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            />
          )}
          
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              value={message}
              onChangeText={setMessage}
              multiline
            />
            <TouchableOpacity 
              style={styles.sendButton} 
              onPress={sendMessage}
              disabled={!message.trim()}
            >
              <Ionicons 
                name="send" 
                size={24} 
                color={message.trim() ? "#fff" : "#b3d9ff"} 
              />
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
    backgroundColor: '#fff',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  loader: {
    marginTop: 20,
  },
  messagesList: {
    padding: 10,
  },
  messageContainer: {
    marginVertical: 5,
    padding: 10,
    borderRadius: 8,
    maxWidth: '80%'
  },
  currentUserMessage: {
    backgroundColor: '#007bff',
    alignSelf: 'flex-end'
  },
  otherUserMessage: {
    backgroundColor: '#e5e5ea',
    alignSelf: 'flex-start'
  },
  messageText: {
    fontSize: 16,
    color: '#fff'
  },
  currentUserText: {
    color: '#fff'
  },
  otherUserText: {
    color: '#000'
  },
  timestamp: {
    fontSize: 10,
    marginTop: 5,
    color: '#ccc',
    textAlign: 'right'
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center'
  },
  input: {
    flex: 1,
    backgroundColor: '#f1f1f1',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    marginRight: 10
  },
  sendButton: {
    backgroundColor: '#007bff',
    padding: 10,
    borderRadius: 20
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: {
    fontSize: 18,
    marginTop: 10,
    color: '#555'
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 5,
    color: '#888'
  }
});

export default ChatRoom;
