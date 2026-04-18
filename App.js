import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { InMemoryEventRepository } from './src/db/repositories/inMemoryEventRepository.js';
import { CHILD_ITEM_TYPES } from './src/types/models.js';

const STORAGE_KEY = 'matender.native.bundles.v2';
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const emptyForm = (date) => ({
  title: '',
  description: '',
  date,
  time: '',
  children: []
});

function toDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fromDateString(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, value) {
  return new Date(date.getFullYear(), date.getMonth() + value, 1);
}

function addDays(date, value) {
  const d = new Date(date);
  d.setDate(d.getDate() + value);
  return d;
}

function calendarCells(monthCursor) {
  const first = startOfMonth(monthCursor);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i);
    return {
      key: toDateString(date),
      day: date.getDate(),
      inMonth: date.getMonth() === monthCursor.getMonth()
    };
  });
}

function randomId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toForm(bundle) {
  return {
    title: bundle.event.title,
    description: bundle.event.description ?? '',
    date: bundle.event.date,
    time: bundle.event.time ?? '',
    children: bundle.children.map((child) => ({
      ...child,
      content: child.content ?? '',
      fileName: child.fileName ?? '',
      fileUri: child.fileUri ?? ''
    }))
  };
}

function seed(repository) {
  const today = toDateString(new Date());
  repository.upsertBundle({
    event: {
      id: randomId('evt'),
      title: 'Matenderへようこそ',
      description: '予定を作成して、子要素としてメモやチェック項目を追加してください。',
      date: today,
      time: '10:00'
    },
    children: [
      {
        id: randomId('child'),
        parentId: 'tmp',
        type: CHILD_ITEM_TYPES.CHECK,
        content: '使い方を確認する',
        isDone: false,
        sortOrder: 0
      }
    ]
  });
}

export default function App() {
  const [repository] = useState(() => new InMemoryEventRepository());
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);

  const [selectedDate, setSelectedDate] = useState(toDateString(new Date()));
  const [monthCursor, setMonthCursor] = useState(startOfMonth(new Date()));

  const [eventModal, setEventModal] = useState({ visible: false, eventId: null });
  const [jsonModalVisible, setJsonModalVisible] = useState(false);
  const [jsonDraft, setJsonDraft] = useState('');
  const [form, setForm] = useState(emptyForm(toDateString(new Date())));

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const bundles = JSON.parse(raw);
          bundles.forEach((bundle) => repository.upsertBundle(bundle));
        } catch {
          repository.clearAll();
          seed(repository);
        }
      } else {
        seed(repository);
      }
      setLoaded(true);
      setRevision((v) => v + 1);
    })();
  }, [repository]);

  const persist = async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(repository.listAllBundles()));
    setRevision((v) => v + 1);
  };

  const events = useMemo(() => repository.listEventsByDate(selectedDate), [repository, selectedDate, revision]);
  const cells = useMemo(() => calendarCells(monthCursor), [monthCursor]);

  const openCreate = () => {
    setForm(emptyForm(selectedDate));
    setEventModal({ visible: true, eventId: null });
  };

  const openEdit = (eventId) => {
    const bundle = repository.getBundleByEventId(eventId);
    if (!bundle) return;
    setForm(toForm(bundle));
    setEventModal({ visible: true, eventId });
  };

  const saveEvent = async () => {
    try {
      const eventId = eventModal.eventId ?? randomId('evt');
      const previous = eventModal.eventId ? repository.getBundleByEventId(eventModal.eventId) : null;

      repository.upsertBundle({
        event: {
          id: eventId,
          title: form.title,
          description: form.description || undefined,
          date: form.date,
          time: form.time || undefined,
          createdAt: previous?.event.createdAt,
          updatedAt: new Date().toISOString()
        },
        children: form.children.map((child, index) => ({
          ...child,
          id: child.id || randomId('child'),
          parentId: eventId,
          sortOrder: Number.isFinite(Number(child.sortOrder)) ? Number(child.sortOrder) : index,
          content: child.content || undefined,
          fileName: child.fileName || undefined,
          fileUri: child.fileUri || undefined,
          createdAt: child.createdAt,
          updatedAt: new Date().toISOString()
        }))
      });

      await persist();
      setSelectedDate(form.date);
      setMonthCursor(startOfMonth(fromDateString(form.date)));
      setEventModal({ visible: false, eventId: null });
    } catch (error) {
      Alert.alert('保存に失敗しました', error.message);
    }
  };

  const deleteEvent = async (eventId) => {
    repository.deleteEvent(eventId);
    await persist();
  };

  const toggleCheckChild = async (eventId, childId) => {
    const bundle = repository.getBundleByEventId(eventId);
    if (!bundle) return;

    repository.upsertBundle({
      event: bundle.event,
      children: bundle.children.map((child) =>
        child.id === childId && child.type === CHILD_ITEM_TYPES.CHECK
          ? { ...child, isDone: !child.isDone, updatedAt: new Date().toISOString() }
          : child
      )
    });

    await persist();
  };

  const openJsonManager = () => {
    setJsonDraft(JSON.stringify(repository.listAllBundles(), null, 2));
    setJsonModalVisible(true);
  };

  const importJson = async () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      if (!Array.isArray(parsed)) {
        throw new Error('配列形式のJSONを入力してください。');
      }

      repository.clearAll();
      parsed.forEach((bundle) => repository.upsertBundle(bundle));
      await persist();
      setJsonModalVisible(false);
    } catch (error) {
      Alert.alert('JSON読み込みエラー', error.message);
    }
  };

  if (!loaded) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text>データを読み込み中...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Matender</Text>
            <Text style={styles.subtitle}>日付と予定/メモをひとまとめに管理</Text>
          </View>
          <View style={styles.row}>
            <Pressable style={styles.secondaryBtn} onPress={openJsonManager}>
              <Text style={styles.secondaryBtnText}>JSON管理</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={openCreate}>
              <Text style={styles.primaryBtnText}>予定追加</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.calendarHeader}>
            <Pressable style={styles.secondaryBtn} onPress={() => setMonthCursor(startOfMonth(addMonths(monthCursor, -1)))}>
              <Text style={styles.secondaryBtnText}>← 前月</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{monthCursor.getFullYear()}年 {monthCursor.getMonth() + 1}月</Text>
            <Pressable style={styles.secondaryBtn} onPress={() => setMonthCursor(startOfMonth(addMonths(monthCursor, 1)))}>
              <Text style={styles.secondaryBtnText}>次月 →</Text>
            </Pressable>
          </View>

          <View style={styles.weekdays}>
            {WEEKDAYS.map((w) => <Text key={w} style={styles.weekday}>{w}</Text>)}
          </View>

          <View style={styles.grid}>
            {cells.map((cell) => {
              const count = repository.listEventsByDate(cell.key).length;
              const selected = cell.key === selectedDate;

              return (
                <Pressable
                  key={cell.key}
                  style={[styles.dayCell, !cell.inMonth && styles.dayCellMuted, selected && styles.dayCellSelected]}
                  onPress={() => setSelectedDate(cell.key)}
                >
                  <Text style={[styles.dayNumber, !cell.inMonth && styles.dayNumberMuted]}>{cell.day}</Text>
                  {!!count && <Text style={styles.eventCount}>{count}件</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{selectedDate} の予定</Text>
            <Text style={styles.sectionSub}>{events.length}件</Text>
          </View>

          {!events.length && <Text style={styles.empty}>予定がありません</Text>}

          {events.map((event) => {
            const bundle = repository.getBundleByEventId(event.id);
            return (
              <View key={event.id} style={styles.eventCard}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventMeta}>{event.time ?? '時刻未設定'} / 子要素 {bundle?.children.length ?? 0}件</Text>
                {!!event.description && <Text style={styles.eventDesc}>{event.description}</Text>}

                {!!bundle?.children.length && (
                  <View style={styles.childList}>
                    {bundle.children.map((child) => (
                      <Pressable
                        key={child.id}
                        style={[styles.childRow, child.type === CHILD_ITEM_TYPES.CHECK && child.isDone && styles.childDone]}
                        onPress={() => child.type === CHILD_ITEM_TYPES.CHECK && toggleCheckChild(event.id, child.id)}
                      >
                        <Text style={styles.childText}>
                          {child.type === CHILD_ITEM_TYPES.CHECK ? (child.isDone ? '☑' : '☐') : '•'} {child.content ?? child.fileName ?? ''}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <View style={styles.row}>
                  <Pressable style={styles.secondaryBtn} onPress={() => openEdit(event.id)}>
                    <Text style={styles.secondaryBtnText}>編集</Text>
                  </Pressable>
                  <Pressable
                    style={styles.dangerBtn}
                    onPress={() =>
                      Alert.alert('削除確認', 'この予定を削除しますか？', [
                        { text: 'キャンセル', style: 'cancel' },
                        { text: '削除', style: 'destructive', onPress: () => deleteEvent(event.id) }
                      ])
                    }
                  >
                    <Text style={styles.dangerText}>削除</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <EventEditorModal
        visible={eventModal.visible}
        form={form}
        setForm={setForm}
        onClose={() => setEventModal({ visible: false, eventId: null })}
        onSave={saveEvent}
      />

      <JsonManagerModal
        visible={jsonModalVisible}
        draft={jsonDraft}
        onChange={setJsonDraft}
        onClose={() => setJsonModalVisible(false)}
        onImport={importJson}
      />
    </SafeAreaView>
  );
}

function EventEditorModal({ visible, form, setForm, onClose, onSave }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalRoot}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Text style={styles.modalTitle}>予定編集</Text>

          <LabelInput label="タイトル" value={form.title} onChangeText={(title) => setForm((prev) => ({ ...prev, title }))} />
          <LabelInput label="説明" value={form.description} multiline onChangeText={(description) => setForm((prev) => ({ ...prev, description }))} />
          <View style={styles.row}>
            <LabelInput label="日付" value={form.date} onChangeText={(date) => setForm((prev) => ({ ...prev, date }))} />
            <LabelInput label="時刻" value={form.time} onChangeText={(time) => setForm((prev) => ({ ...prev, time }))} />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>子要素</Text>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() =>
                setForm((prev) => ({
                  ...prev,
                  children: [
                    ...prev.children,
                    {
                      id: randomId('child'),
                      type: CHILD_ITEM_TYPES.MEMO,
                      content: '',
                      sortOrder: prev.children.length,
                      isDone: undefined,
                      fileName: '',
                      fileUri: ''
                    }
                  ]
                }))
              }
            >
              <Text style={styles.secondaryBtnText}>追加</Text>
            </Pressable>
          </View>

          {form.children.map((child, index) => (
            <View key={child.id || index} style={styles.childEditor}>
              <Text style={styles.childEditorTitle}>子要素 #{index + 1}</Text>
              <View style={styles.row}>
                {Object.values(CHILD_ITEM_TYPES).map((type) => (
                  <Pressable
                    key={type}
                    style={[styles.chip, child.type === type && styles.chipSelected]}
                    onPress={() =>
                      setForm((prev) => ({
                        ...prev,
                        children: prev.children.map((c, i) => (i === index ? { ...c, type } : c))
                      }))
                    }
                  >
                    <Text style={child.type === type ? styles.chipTextSelected : styles.chipText}>{type}</Text>
                  </Pressable>
                ))}
              </View>

              <LabelInput
                label="content"
                value={child.content ?? ''}
                onChangeText={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    children: prev.children.map((c, i) => (i === index ? { ...c, content: value } : c))
                  }))
                }
              />

              <View style={styles.row}>
                <LabelInput
                  label="fileName"
                  value={child.fileName ?? ''}
                  onChangeText={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      children: prev.children.map((c, i) => (i === index ? { ...c, fileName: value } : c))
                    }))
                  }
                />
                <LabelInput
                  label="fileUri"
                  value={child.fileUri ?? ''}
                  onChangeText={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      children: prev.children.map((c, i) => (i === index ? { ...c, fileUri: value } : c))
                    }))
                  }
                />
              </View>

              <Pressable
                style={styles.dangerBtn}
                onPress={() =>
                  setForm((prev) => ({
                    ...prev,
                    children: prev.children.filter((_, i) => i !== index)
                  }))
                }
              >
                <Text style={styles.dangerText}>子要素を削除</Text>
              </Pressable>
            </View>
          ))}

          <View style={styles.row}>
            <Pressable style={styles.secondaryBtn} onPress={onClose}>
              <Text style={styles.secondaryBtnText}>キャンセル</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={onSave}>
              <Text style={styles.primaryBtnText}>保存</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function JsonManagerModal({ visible, draft, onChange, onClose, onImport }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.jsonBackdrop}>
        <View style={styles.jsonModal}>
          <Text style={styles.modalTitle}>JSON管理</Text>
          <Text style={styles.sectionSub}>エクスポートは下記をコピー、インポートは編集して読み込み。</Text>
          <TextInput
            multiline
            value={draft}
            onChangeText={onChange}
            style={[styles.input, styles.jsonInput]}
          />
          <View style={styles.row}>
            <Pressable style={styles.secondaryBtn} onPress={onClose}>
              <Text style={styles.secondaryBtnText}>閉じる</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={onImport}>
              <Text style={styles.primaryBtnText}>読み込み</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LabelInput({ label, ...props }) {
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor="#A0ABC3"
        style={[styles.input, props.multiline && styles.inputMultiline]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F6FF' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#1F2C49' },
  subtitle: { color: '#5E6D8F', marginTop: 2 },

  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#DDE6F7', padding: 12 },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  monthLabel: { fontWeight: '700', color: '#2A3858' },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: '#7282A8', fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  dayCell: { width: '13.2%', minHeight: 60, borderWidth: 1, borderColor: '#DDE6F7', borderRadius: 10, padding: 6 },
  dayCellMuted: { opacity: 0.55, backgroundColor: '#F8FAFF' },
  dayCellSelected: { borderColor: '#3C71F8', backgroundColor: '#EAF0FF' },
  dayNumber: { color: '#2A3858' },
  dayNumberMuted: { color: '#99A7C8' },
  eventCount: { fontSize: 11, color: '#3C71F8', marginTop: 6 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F2C49' },
  sectionSub: { color: '#6A789B', marginBottom: 8 },
  empty: { textAlign: 'center', color: '#6A789B', paddingVertical: 16 },

  eventCard: { borderWidth: 1, borderColor: '#DDE6F7', borderRadius: 12, padding: 12, marginBottom: 8, backgroundColor: '#F8FAFF' },
  eventTitle: { fontWeight: '700', color: '#1F2C49', fontSize: 15 },
  eventMeta: { color: '#607096', marginTop: 4 },
  eventDesc: { color: '#2D3A59', marginTop: 6 },
  childList: { marginTop: 8, gap: 6 },
  childRow: { borderWidth: 1, borderColor: '#D8E2F6', borderRadius: 8, padding: 8, backgroundColor: '#FFF' },
  childDone: { opacity: 0.6 },
  childText: { color: '#3A486A' },

  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  primaryBtn: { backgroundColor: '#3C71F8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#EBF1FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  secondaryBtnText: { color: '#3656A7', fontWeight: '600' },
  dangerBtn: { backgroundColor: '#FFE8EF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  dangerText: { color: '#B12B4E', fontWeight: '700' },

  modalRoot: { flex: 1, backgroundColor: '#F3F6FF' },
  modalBody: { padding: 16, gap: 10 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#1F2C49', marginBottom: 4 },
  inputWrap: { flex: 1 },
  label: { fontSize: 12, color: '#69789E', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#D8E2F6', borderRadius: 10, backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 10, color: '#243456' },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  childEditor: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#C7D4F2', borderRadius: 10, padding: 10, gap: 8 },
  childEditorTitle: { fontWeight: '700', color: '#2B3B61' },
  chip: { borderWidth: 1, borderColor: '#C7D4F2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipSelected: { backgroundColor: '#3C71F8', borderColor: '#3C71F8' },
  chipText: { color: '#42547D' },
  chipTextSelected: { color: '#FFF', fontWeight: '700' },

  jsonBackdrop: { flex: 1, backgroundColor: 'rgba(9,16,34,0.46)', alignItems: 'center', justifyContent: 'center', padding: 14 },
  jsonModal: { width: '100%', maxWidth: 760, maxHeight: '90%', backgroundColor: '#FFF', borderRadius: 14, padding: 14 },
  jsonInput: { minHeight: 320, fontSize: 12, fontFamily: 'Courier' }
});
