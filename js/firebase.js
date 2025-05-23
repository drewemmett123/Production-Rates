/**
 * Firebase Integration Module
 * Handles all storage operations through Firebase
 */

const FirebaseStorage = {
  db: null,
  isInitialized: false,
  
  // Initialize Firebase
  async init() {
    try {
      // Check if Firebase is already initialized
      if (this.isInitialized) {
        console.log('Firebase already initialized');
        return true;
      }
      
      // Initialize Firebase app
      const firebaseConfig = {
        apiKey: "AIzaSyDbGQs4You0gE3DQB-a9jOsOm6wniTQ4PA",
        authDomain: "luminaryops.firebaseapp.com",
        databaseURL: "https://luminaryops-default-rtdb.firebaseio.com",
        projectId: "luminaryops",
        storageBucket: "luminaryops.firebasestorage.app",
        messagingSenderId: "1042887515037",
        appId: "1:1042887515037:web:57b98b9ee44c8140732d74",
        measurementId: "G-6CNGJQ7YC8"
      };
      
      // Initialize Firebase
      firebase.initializeApp(firebaseConfig);
      this.db = firebase.firestore();
      this.isInitialized = true;
      
      console.log('Firebase initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing Firebase:', error);
      return false;
    }
  },
  
  // Convert data to be Firestore-compatible (improved event handling)
  sanitizeDataForFirestore(data) {
    if (!data) return data;
    
    // If it's an array, process each item
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeDataForFirestore(item));
    }
    
    // If it's an object, process each property
    if (typeof data === 'object' && data !== null) {
      const sanitized = {};
      
      for (const [key, value] of Object.entries(data)) {
        // Skip html property as it often contains complex structures
        if (key === 'html') {
          sanitized[key] = typeof value === 'string' ? 
            'HTML content stored separately' : 'Complex content stored separately';
          continue;
        }
        
        // Special handling for events property
        if (key === 'events') {
          // Create a deep copy of events with properly sanitized structure
          const sanitizedEvents = {};
          
          for (const [dateStr, eventList] of Object.entries(value)) {
            if (Array.isArray(eventList)) {
              // Sanitize each event in the list, preserving essential properties
              sanitizedEvents[dateStr] = eventList.map(event => ({
                id: event.id || `event_${Date.now()}`,
                date: event.date,
                title: event.title || 'Untitled Event',
                description: event.description || '',
                type: event.type || 'regular',
                fullDay: event.fullDay || false,
                startTime: event.startTime || '00:00',
                endTime: event.endTime || '23:59',
                // Simplify clientData to avoid complex nesting
                clientData: event.clientData ? {
                  clientName: event.clientData.clientName || '',
                  projectName: event.clientData.projectName || '',
                  projectLocation: event.clientData.projectLocation || '',
                  depositPaid: event.clientData.depositPaid || false,
                  notes: event.clientData.notes || '',
                  quoteId: event.clientData.quoteId || '',
                  travelDays: event.clientData.travelDays || 0,
                  isTravel: event.clientData.isTravel || false,
                  travelLabel: event.clientData.travelLabel || '',
                  projectStartDate: event.clientData.projectStartDate || '',
                  projectEndDate: event.clientData.projectEndDate || ''
                } : null
              }));
            } else {
              sanitizedEvents[dateStr] = [];
            }
          }
          
          sanitized[key] = sanitizedEvents;
          continue;
        }
        
        // Handle arrays and objects
        if (Array.isArray(value)) {
          // For arrays, stringify them if they contain objects or other arrays
          if (value.some(item => typeof item === 'object' || Array.isArray(item))) {
            try {
              sanitized[key] = JSON.stringify(value);
            } catch (e) {
              console.error(`Failed to stringify ${key}:`, e);
              sanitized[key] = JSON.stringify([]);
            }
          } else {
            sanitized[key] = value;
          }
        } else if (typeof value === 'object' && value !== null) {
          // For objects, recursively sanitize
          sanitized[key] = this.sanitizeDataForFirestore(value);
        } else {
          // For primitive values, store as is
          sanitized[key] = value;
        }
      }
      
      return sanitized;
    }
    
    // Return primitive values as is
    return data;
  },
  
  // Save history data (quotes and invoices)
  async saveHistory(historyData) {
    try {
      if (!this.isInitialized) await this.init();
      
      // Create a Firestore-compatible version of the data
      const sanitizedData = this.sanitizeDataForFirestore(historyData);
      
      // Store sanitized data in Firestore
      await this.db.collection('history').doc('user_data').set({ 
        data: sanitizedData,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Separately store each item's HTML content for retrieval
      for (const item of historyData) {
        if (item.html && item.id) {
          await this.db.collection('history_html').doc(item.id).set({
            html: item.html,
            itemId: item.id,
            type: item.type,
            date: item.date
          });
        }
      }
      
      console.log('History data saved to Firebase');
      return true;
    } catch (error) {
      console.error('Error saving history data:', error);
      return false;
    }
  },
  
  // Restore data from Firestore format with improved handling for events
  restoreDataFromFirestore(sanitizedData) {
    if (!sanitizedData) return sanitizedData;
    
    // If it's an array, process each item
    if (Array.isArray(sanitizedData)) {
      return sanitizedData.map(item => this.restoreDataFromFirestore(item));
    }
    
    // If it's an object, process each property
    if (typeof sanitizedData === 'object' && sanitizedData !== null) {
      const restored = { ...sanitizedData };
      
      for (const [key, value] of Object.entries(restored)) {
        // Special handling for events object
        if (key === 'events') {
          // Ensure each date has a properly structured event array
          const restoredEvents = {};
          
          for (const [dateStr, eventList] of Object.entries(value)) {
            if (Array.isArray(eventList)) {
              restoredEvents[dateStr] = eventList.map(event => {
                // Ensure all event objects have required fields
                return {
                  id: event.id || `event_${Date.now()}`,
                  date: event.date || dateStr,
                  title: event.title || 'Untitled Event',
                  description: event.description || '',
                  type: event.type || 'regular',
                  fullDay: typeof event.fullDay === 'boolean' ? event.fullDay : false,
                  startTime: event.startTime || '00:00',
                  endTime: event.endTime || '23:59',
                  clientData: event.clientData || null
                };
              });
            } else if (typeof eventList === 'string') {
              // Try to parse stringified event list
              try {
                const parsedEventList = JSON.parse(eventList);
                restoredEvents[dateStr] = Array.isArray(parsedEventList) ? 
                  parsedEventList.map(event => ({
                    id: event.id || `event_${Date.now()}`,
                    date: event.date || dateStr,
                    title: event.title || 'Untitled Event',
                    description: event.description || '',
                    type: event.type || 'regular',
                    fullDay: typeof event.fullDay === 'boolean' ? event.fullDay : false,
                    startTime: event.startTime || '00:00',
                    endTime: event.endTime || '23:59',
                    clientData: event.clientData || null
                  })) : [];
              } catch (e) {
                console.error(`Failed to parse events for date ${dateStr}:`, e);
                restoredEvents[dateStr] = [];
              }
            } else {
              restoredEvents[dateStr] = [];
            }
          }
          
          restored[key] = restoredEvents;
          continue;
        }
        
        // Try to parse stringified arrays and objects
        if (typeof value === 'string' && 
            (value.startsWith('[') || value.startsWith('{'))) {
          try {
            restored[key] = JSON.parse(value);
          } catch (e) {
            console.log(`Failed to parse ${key}, keeping as string`);
          }
        } else if (typeof value === 'object' && value !== null) {
          // Recursively restore nested objects
          restored[key] = this.restoreDataFromFirestore(value);
        }
      }
      
      return restored;
    }
    
    // Return primitive values as is
    return sanitizedData;
  },
  
  // Load history data
  async loadHistory() {
    try {
      if (!this.isInitialized) await this.init();
      
      // Get sanitized history data
      const doc = await this.db.collection('history').doc('user_data').get();
      let historyData = [];
      
      if (doc.exists) {
        const sanitizedData = doc.data().data || [];
        historyData = this.restoreDataFromFirestore(sanitizedData);
        
        // Load HTML content for each item
        for (const item of historyData) {
          if (item.id) {
            const htmlDoc = await this.db.collection('history_html').doc(item.id).get();
            if (htmlDoc.exists) {
              item.html = htmlDoc.data().html;
            }
          }
        }
        
        console.log('History data loaded from Firebase');
      } else {
        console.log('No history data found in Firebase');
      }
      
      return historyData;
    } catch (error) {
      console.error('Error loading history data:', error);
      return [];
    }
  },
  
  // Save calendar availability data with improved event handling
  async saveCalendarData(availability) {
    try {
      if (!this.isInitialized) await this.init();
      
      // Convert availability data to be Firestore-compatible
      const sanitizedAvailability = this.sanitizeDataForFirestore(availability);
      
      // Add logging to check what's being saved
      console.log('Saving calendar data to Firebase:', JSON.stringify(sanitizedAvailability).substring(0, 500) + '...');
      
      await this.db.collection('calendar').doc('availability').set(sanitizedAvailability);
      console.log('Calendar data saved to Firebase');
      return true;
    } catch (error) {
      console.error('Error saving calendar data:', error);
      return false;
    }
  },
  
  // Load calendar availability data with improved event handling
  async loadCalendarData() {
    try {
      if (!this.isInitialized) await this.init();
      
      const doc = await this.db.collection('calendar').doc('availability').get();
      if (doc.exists) {
        const sanitizedData = doc.data();
        const restored = this.restoreDataFromFirestore(sanitizedData);
        
        // Add logging to check what was loaded
        console.log('Calendar data loaded from Firebase:', 
          JSON.stringify(restored).substring(0, 500) + '...');
        
        // Ensure all expected properties exist
        if (!restored.events) restored.events = {};
        if (!restored.blockedDates) restored.blockedDates = {};
        if (!restored.bookedDates) restored.bookedDates = {};
        
        return restored;
      } else {
        console.log('No calendar data found in Firebase');
        // Include all required properties
        return { bookedDates: {}, blockedDates: {}, events: {} };
      }
    } catch (error) {
      console.error('Error loading calendar data:', error);
      // Include all required properties
      return { bookedDates: {}, blockedDates: {}, events: {} };
    }
  },
  
  // Save signature data
  async saveSignatureData(signatureData) {
    try {
      if (!this.isInitialized) await this.init();
      
      // Sanitize signature data to be Firestore-compatible
      const sanitizedData = this.sanitizeDataForFirestore(signatureData);
      
      // Add to signature collection
      await this.db.collection('signatures').add({
        ...sanitizedData,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('Signature data saved to Firebase');
      return true;
    } catch (error) {
      console.error('Error saving signature data:', error);
      return false;
    }
  },
  
  // Load signature history
  async loadSignatureHistory() {
    try {
      if (!this.isInitialized) await this.init();
      
      const snapshot = await this.db.collection('signatures')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();
      
      const signatures = [];
      snapshot.forEach(doc => {
        const data = this.restoreDataFromFirestore(doc.data());
        signatures.push({
          id: doc.id,
          ...data
        });
      });
      
      console.log('Signature history loaded from Firebase');
      return signatures;
    } catch (error) {
      console.error('Error loading signature history:', error);
      return [];
    }
  },
  
  // Save user preferences
  async savePreferences(preferences) {
    try {
      if (!this.isInitialized) await this.init();
      
      await this.db.collection('preferences').doc('user_prefs').set(preferences);
      console.log('Preferences saved to Firebase');
      return true;
    } catch (error) {
      console.error('Error saving preferences:', error);
      return false;
    }
  },
  
  // Load user preferences
  async loadPreferences() {
    try {
      if (!this.isInitialized) await this.init();
      
      const doc = await this.db.collection('preferences').doc('user_prefs').get();
      if (doc.exists) {
        console.log('Preferences loaded from Firebase');
        return doc.data() || { theme: 'dark' };
      } else {
        console.log('No preferences found in Firebase');
        return { theme: 'dark' };
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      return { theme: 'dark' };
    }
  }
};
