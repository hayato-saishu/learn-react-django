from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from .models import Todo


class TodoModelTest(TestCase):
    def test_create_todo(self):
        todo = Todo.objects.create(title='Test Todo')
        self.assertEqual(todo.title, 'Test Todo')
        self.assertFalse(todo.completed)

    def test_str_representation(self):
        todo = Todo.objects.create(title='Test Todo')
        self.assertEqual(str(todo), 'Test Todo')


class TodoAPITest(APITestCase):
    def setUp(self):
        self.todo1 = Todo.objects.create(title='First Todo')
        self.todo2 = Todo.objects.create(title='Second Todo', completed=True)

    def test_list_todos(self):
        url = reverse('todo-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_create_todo(self):
        url = reverse('todo-list')
        data = {'title': 'New Todo', 'completed': False}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Todo.objects.count(), 3)

    def test_update_todo(self):
        url = reverse('todo-detail', args=[self.todo1.id])
        data = {'title': 'Updated Todo', 'completed': True}
        response = self.client.put(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.todo1.refresh_from_db()
        self.assertTrue(self.todo1.completed)

    def test_delete_todo(self):
        url = reverse('todo-detail', args=[self.todo1.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Todo.objects.count(), 1)
